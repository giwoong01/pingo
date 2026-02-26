import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rule } from '../entities/rule.entity';
import { RuleState } from '../entities/rule-state.entity';
import { App } from '../entities/app.entity';
import { Cluster } from '../entities/cluster.entity';
import { Webhook } from '../entities/webhook.entity';
import { AlertEvent } from '../entities/alert-event.entity';
import { RuleWebhook } from '../entities/rule-webhook.entity';
import { Instance } from '../entities/instance.entity';
import { NotificationRoute } from '../entities/notification-route.entity';
import { NotificationSilence } from '../entities/notification-silence.entity';
import { ClustersService } from './clusters.service';
import { PrometheusService } from './prometheus.service';
import { RulesService } from './rules.service';
import { DiscordService } from './discord.service';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';

type EvidenceQuery = { id: string; promql: string };

@Injectable()
export class AlertEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEngineService.name);
  private timer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  private cachedRules: Rule[] = [];
  private nextRunAtByRuleId = new Map<string, number>();
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Rule) private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(RuleState) private readonly stateRepo: Repository<RuleState>,
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    @InjectRepository(Webhook) private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(RuleWebhook) private readonly linkRepo: Repository<RuleWebhook>,
    @InjectRepository(AlertEvent) private readonly eventRepo: Repository<AlertEvent>,
    @InjectRepository(Instance) private readonly instanceRepo: Repository<Instance>,
    @InjectRepository(NotificationRoute) private readonly routeRepo: Repository<NotificationRoute>,
    @InjectRepository(NotificationSilence) private readonly silenceRepo: Repository<NotificationSilence>,
    private readonly clusters: ClustersService,
    private readonly prom: PrometheusService,
    private readonly rules: RulesService,
    private readonly discord: DiscordService,
    private readonly ai: AiService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('ALERT_ENGINE_ENABLED', 'true') !== 'false';
    if (!enabled) {
      this.logger.warn('Alert engine disabled via ALERT_ENGINE_ENABLED=false');
      return;
    }
    this.refreshRules().catch(() => {});
    this.refreshTimer = setInterval(() => this.refreshRules().catch(() => {}), 30_000);
    this.timer = setInterval(() => this.tick().catch(() => {}), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async refreshRules() {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this._refreshRules().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async _refreshRules() {
    this.cachedRules = await this.ruleRepo.find({ where: { enabled: true } });
    const enabledIds = new Set(this.cachedRules.map((r) => r.id));
    for (const id of Array.from(this.nextRunAtByRuleId.keys())) {
      if (!enabledIds.has(id)) this.nextRunAtByRuleId.delete(id);
    }
    const now = Date.now();
    for (const rule of this.cachedRules) {
      if (!this.nextRunAtByRuleId.has(rule.id)) {
        this.nextRunAtByRuleId.set(rule.id, now);
      }
    }
  }

  private evictRule(ruleId: string, why: string) {
    this.cachedRules = this.cachedRules.filter((r) => r.id !== ruleId);
    this.nextRunAtByRuleId.delete(ruleId);
    this.logger.warn(`Evicted rule from cache. ruleId=${ruleId} why=${why}`);
  }

  private isPgForeignKeyViolation(e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    return code === '23503' || msg.includes('violates foreign key constraint');
  }

  private async tick() {
    const now = Date.now();
    const due = this.cachedRules.filter((r) => (this.nextRunAtByRuleId.get(r.id) ?? 0) <= now);
    if (due.length === 0) return;

    const limit = Math.max(1, Number(this.config.get<number>('ALERT_ENGINE_CONCURRENCY', 3)));
    const queue = [...due];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < limit; i++) {
      workers.push(
        (async () => {
          while (queue.length) {
            const rule = queue.shift();
            if (!rule) break;
            await this.evaluateRule(rule).catch((e) => {
              this.logger.warn(`Rule evaluation failed. ruleId=${rule.id} err=${e?.message || e}`);
            });
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  private async evaluateRule(rule: Rule) {
    const now = Date.now();
    this.nextRunAtByRuleId.set(rule.id, now + Math.max(5, rule.intervalSeconds) * 1000);

    const ruleExists = await this.ruleRepo.findOne({ where: { id: rule.id, enabled: true }, select: ['id'] as any });
    if (!ruleExists) {
      this.evictRule(rule.id, 'deleted_or_disabled');
      return;
    }

    const scopedInstance = rule.instanceId ? await this.instanceRepo.findOne({ where: { id: rule.instanceId } }) : null;
    if (rule.instanceId && (!scopedInstance || !scopedInstance.enabled)) return;
    const app = rule.appId ? await this.appRepo.findOne({ where: { id: rule.appId } }) : null;
    if (app && !app.enabled) return;
    const clusterId = app?.clusterId || scopedInstance?.clusterId;
    if (!clusterId) return;
    if (app && scopedInstance && scopedInstance.clusterId !== app.clusterId) return;
    const cluster = await this.clusterRepo.findOne({ where: { id: clusterId } });
    if (!cluster || !cluster.enabled) return;

    const token = await this.clusters.resolveBearerToken(clusterId);
    const expr = this.rules.interpolate(rule.expr, app?.job || '', scopedInstance?.prometheusInstance || undefined);
    const value = await this.prom.queryScalarSum(cluster.prometheusUrl, expr, token);
    const nowDate = new Date();

    let state = await this.stateRepo.findOne({ where: { ruleId: rule.id } });
    if (!state) {
      state = this.stateRepo.create({
        ruleId: rule.id,
        workspaceId: rule.workspaceId || app?.workspaceId || scopedInstance?.workspaceId || null,
        state: 'OK',
        lastEvalCategory: 'OK',
      });
    }
    const prevCategory = state.lastEvalCategory || 'OK';
    const evalCategory = await this.resolveEvalCategory(
      cluster.prometheusUrl,
      app?.job || undefined,
      scopedInstance?.prometheusInstance || undefined,
    );

    state.lastEvalAt = nowDate;
    state.lastEvalCategory = evalCategory;
    if (evalCategory !== 'OK') {
      state.lastEvalOk = false;
      state.lastEvalError = evalCategory === 'NO_DATA' ? 'prometheus_no_data' : 'prometheus_datasource_error';
      state.lastValue = null;
      if (state.state === 'FIRING') {
        await this.persistResolvedEvent(rule, app || null, state.firingSince ?? nowDate, nowDate, null);
      }
      state.state = 'OK';
      state.pendingSince = null;
      state.firingSince = null;
      await this.stateRepo.save(state);
      if (prevCategory !== evalCategory) {
        await this.emitEvalCategoryEvent(rule, app || null, evalCategory, nowDate);
      }
      return;
    }

    state.lastEvalOk = value !== null;
    state.lastEvalError = value === null ? 'prometheus_query_failed' : null;
    state.lastValue = value;
    if (value === null) {
      state.lastEvalCategory = 'DATASOURCE_ERROR';
      if (state.state === 'FIRING') {
        await this.persistResolvedEvent(rule, app || null, state.firingSince ?? nowDate, nowDate, null);
      }
      state.state = 'OK';
      state.pendingSince = null;
      state.firingSince = null;
      await this.stateRepo.save(state);
      if (prevCategory !== 'DATASOURCE_ERROR') {
        await this.emitEvalCategoryEvent(rule, app || null, 'DATASOURCE_ERROR', nowDate);
      }
      return;
    }

    const active = value > 0;
    if (!active) {
      if (state.state === 'FIRING') {
        await this.persistResolvedEvent(rule, app || null, state.firingSince ?? nowDate, nowDate, value);
      }
      state.state = 'OK';
      state.pendingSince = null;
      state.firingSince = null;
      state.lastEvalCategory = 'OK';
      await this.stateRepo.save(state);
      return;
    }
    if (state.state === 'OK') {
      state.state = 'PENDING';
      state.pendingSince = nowDate;
      await this.stateRepo.save(state);
      return;
    }

    if (state.state === 'PENDING') {
      const pendingSince = state.pendingSince?.getTime() ?? now;
      const elapsed = now - pendingSince;
      if (elapsed < Math.max(0, rule.forSeconds) * 1000) {
        await this.stateRepo.save(state);
        return;
      }
      state.state = 'FIRING';
      state.firingSince = state.pendingSince ?? nowDate;
      state.pendingSince = null;
      await this.stateRepo.save(state);
      await this.onFiring(
        rule,
        app || null,
        scopedInstance || null,
        cluster,
        token,
        value,
        state.firingSince,
        scopedInstance?.prometheusInstance || undefined,
        scopedInstance?.id || undefined,
      );
      return;
    }

    const lastSentAt = state.lastSentAt?.getTime() ?? 0;
    const cooldownMs = Math.max(0, rule.cooldownSeconds) * 1000;
    if (cooldownMs > 0 && now - lastSentAt < cooldownMs) {
      await this.stateRepo.save(state);
      return;
    }
    await this.onFiring(
      rule,
      app || null,
      scopedInstance || null,
      cluster,
      token,
      value,
      state.firingSince ?? nowDate,
      scopedInstance?.prometheusInstance || undefined,
      scopedInstance?.id || undefined,
    );
    return;
  }

  private async resolveEvalCategory(
    queryUrl: string,
    job: string | undefined,
    bearerToken: string | null,
    prometheusInstance?: string,
  ): Promise<'OK' | 'NO_DATA' | 'DATASOURCE_ERROR'> {
    const heartbeat = await this.prom.queryScalarDetail(queryUrl, 'vector(1)', bearerToken);
    if (heartbeat.status === 'error') return 'DATASOURCE_ERROR';

    const targetCountExpr =
      job && String(job).trim()
        ? this.rules.interpolate('count(up{job="${job}"${instanceMatcher}})', job, prometheusInstance)
        : this.rules.interpolate('count(up{${instanceMatcherOnly}})', '', prometheusInstance);
    const targetCount = await this.prom.queryScalarDetail(queryUrl, targetCountExpr, bearerToken);
    if (targetCount.status === 'error') return 'DATASOURCE_ERROR';
    if (targetCount.status === 'no_data') return 'NO_DATA';
    if ((targetCount.value ?? 0) <= 0) return 'NO_DATA';
    return 'OK';
  }

  private async emitEvalCategoryEvent(
    rule: Rule,
    app: App | null,
    category: 'NO_DATA' | 'DATASOURCE_ERROR',
    nowDate: Date,
  ) {
    const status = category === 'NO_DATA' ? 'NO_DATA' : 'DATASOURCE_ERROR';
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          ruleId: rule.id,
          workspaceId: rule.workspaceId || app?.workspaceId || null,
          appId: app?.id || null,
          startedAt: nowDate,
          endedAt: nowDate,
          value: null,
        }),
      );
    } catch (e: any) {
      if (this.isPgForeignKeyViolation(e)) {
        this.evictRule(rule.id, `fk_on_${status.toLowerCase()}`);
        await this.refreshRules().catch(() => {});
        return;
      }
      this.logger.warn(`Failed to persist ${status} event. ruleId=${rule.id} err=${e?.message || e}`);
    }
  }

  private async persistResolvedEvent(rule: Rule, app: App | null, startedAt: Date, endedAt: Date, value: number | null) {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          ruleId: rule.id,
          workspaceId: rule.workspaceId || app?.workspaceId || null,
          appId: app?.id || null,
          status: 'RESOLVED',
        }),
      );
    } catch (e: any) {
      if (this.isPgForeignKeyViolation(e)) {
        this.evictRule(rule.id, 'fk_on_resolve');
        await this.refreshRules().catch(() => {});
        return;
      }
      this.logger.warn(`Failed to persist RESOLVED event. ruleId=${rule.id} err=${e?.message || e}`);
    }
  }

  private evidenceQueriesFor(kind: Rule['kind']): EvidenceQuery[] {
    const errorBudget = this.getSloErrorBudgetRatio();
    const base = [
      { id: 'up_sum', promql: 'sum(up{job="${job}"${instanceMatcher}})' },
      {
        id: 'cpu_cores',
        promql:
          '(sum(rate(process_cpu_seconds_total{job="${job}"${instanceMatcher}}[1m]))) or (sum(rate(process_cpu_time_ns_total{job="${job}"${instanceMatcher}}[1m])) / 1e9) or (sum(process_cpu_usage{job="${job}"${instanceMatcher}}))',
      },
      { id: 'rss_bytes', promql: 'max(process_resident_memory_bytes{job="${job}"${instanceMatcher}})' },
      { id: 'rps', promql: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m]))' },
      {
        id: 'http_5xx_ratio',
        promql:
          'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)',
      },
      {
        id: 'error_ratio_5m',
        promql:
          'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)',
      },
      {
        id: 'burn_rate_5m',
        promql: `(sum(rate(http_server_requests_seconds_count{job="\${job}"\${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="\${job}"\${instanceMatcher}}[5m])), 1)) / ${errorBudget}`,
      },
      {
        id: 'latency_p95_s',
        promql:
          '(histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m])))',
      },
      {
        id: 'heap_ratio',
        promql:
          'sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"}) / clamp_min(sum(jvm_memory_max_bytes{job="${job}"${instanceMatcher},area="heap"} > 0), 1)',
      },
      {
        id: 'gc_pause_avg_ms',
        promql:
          '1000 * (sum(rate(jvm_gc_pause_seconds_sum{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1))',
      },
    ];

    if (kind === 'INSTANCE_DOWN') return base.filter((q) => q.id === 'up_sum');
    if (kind === 'HEAP_RATIO_HIGH') return base.filter((q) => ['up_sum', 'heap_ratio', 'gc_pause_avg_ms'].includes(q.id));
    if (kind === 'GC_PAUSE_AVG_HIGH') return base.filter((q) => ['up_sum', 'gc_pause_avg_ms', 'heap_ratio'].includes(q.id));
    if (kind === 'CPU_CORES_HIGH') return base.filter((q) => ['up_sum', 'cpu_cores', 'rps'].includes(q.id));
    if (kind === 'RSS_BYTES_HIGH') return base.filter((q) => ['up_sum', 'rss_bytes', 'cpu_cores'].includes(q.id));
    if (kind === 'HTTP_5XX_RATIO_HIGH') return base.filter((q) => ['up_sum', 'http_5xx_ratio', 'error_ratio_5m', 'rps', 'latency_p95_s'].includes(q.id));
    if (kind === 'HTTP_LATENCY_P95_HIGH') return base.filter((q) => ['up_sum', 'latency_p95_s', 'rps', 'http_5xx_ratio'].includes(q.id));
    if (kind === 'HTTP_RPS_DROP') return base.filter((q) => ['up_sum', 'rps', 'http_5xx_ratio', 'latency_p95_s'].includes(q.id));
    if (kind === 'SLO_BURN_RATE_HIGH') return base.filter((q) => ['up_sum', 'burn_rate_5m', 'error_ratio_5m', 'http_5xx_ratio', 'rps'].includes(q.id));
    return base;
  }

  private getSloErrorBudgetRatio(): number {
    const v = Number(this.config.get<string>('SLO_ERROR_BUDGET_RATIO', '0.001'));
    if (!Number.isFinite(v) || v <= 0) return 0.001;
    return v;
  }

  private async onFiring(
    rule: Rule,
    app: App | null,
    scopedInstance: Instance | null,
    cluster: Cluster,
    token: string | null,
    value: number | null,
    firingSince: Date,
    prometheusInstance?: string,
    instanceEntityId?: string,
  ) {
    const snapshot: Record<string, any> = {
      primary: { expr: this.rules.interpolate(rule.expr, app?.job || '', prometheusInstance), value },
      evidence: {},
    };

    for (const ev of this.evidenceQueriesFor(rule.kind)) {
      const q = this.rules.interpolate(ev.promql, app?.job || '', prometheusInstance);
      const v = await this.prom.queryScalarSum(cluster.prometheusUrl, q, token);
      snapshot.evidence[ev.id] = { expr: q, value: v };
    }

    let event: AlertEvent | null = null;
    try {
      event = await this.eventRepo.save(
        this.eventRepo.create({
          ruleId: rule.id,
          workspaceId: rule.workspaceId || app?.workspaceId || null,
          appId: app?.id || null,
          status: 'FIRING',
          startedAt: firingSince,
          endedAt: null,
        }),
      );
    } catch (e: any) {
      if (this.isPgForeignKeyViolation(e)) {
        this.evictRule(rule.id, 'fk_on_fire');
        await this.refreshRules().catch(() => {});
        return;
      }
      this.logger.warn(`Failed to persist FIRING event. ruleId=${rule.id} err=${e?.message || e}`);
    }

    const aiContext = {
      app: {
        id: app?.id || null,
        name: app?.name || scopedInstance?.name || 'Instance',
        job: app?.job || '',
        instanceId: scopedInstance?.id || null,
        instance: scopedInstance?.prometheusInstance || null,
      },
      rule: {
        id: rule.id,
        name: rule.name,
        kind: rule.kind,
        severity: rule.severity,
        forSeconds: rule.forSeconds,
        intervalSeconds: rule.intervalSeconds,
      },
      firedAt: new Date().toISOString(),
      firingSince: firingSince.toISOString(),
    };
    let aiReport: any | null = null;
    try {
      aiReport = await this.ai.analyzeAlert(aiContext);
    } catch (e: any) {
      this.logger.warn(`AI analysis failed. ruleId=${rule.id} err=${e?.message || e}`);
    }
    if (aiReport && event) {
      try {
        await this.eventRepo.update({ id: event.id }, { aiReport });
      } catch (e: any) {
        this.logger.warn(`Failed to persist aiReport. ruleId=${rule.id} err=${e?.message || e}`);
      }
    }

    const targetAppId = app?.id;
    const targetInstanceId = instanceEntityId || scopedInstance?.id || undefined;
    const scopedWorkspace = rule.workspaceId || app?.workspaceId || scopedInstance?.workspaceId || undefined;
    const allEnabledWebhooks = await this.webhookRepo.find({
      where: { enabled: true, workspaceId: scopedWorkspace } as any,
      order: { createdAt: 'ASC' },
    });
    const links = await this.linkRepo.find({ where: { ruleId: rule.id } });
    const selectedIds = Array.from(new Set(links.map((l) => l.webhookId)));
    const defaultWebhookIds =
      selectedIds.length > 0
        ? allEnabledWebhooks.filter((w) => selectedIds.includes(w.id)).map((w) => w.id)
        : allEnabledWebhooks.map((w) => w.id);

    const routeResult = await this.resolveRouteTargets(scopedWorkspace, targetAppId, targetInstanceId, rule.severity, defaultWebhookIds, allEnabledWebhooks);

    const silence = await this.findActiveSilence(scopedWorkspace, targetAppId, targetInstanceId, rule.severity, new Date());
    snapshot.notification = {
      routeName: routeResult.routeName || null,
      webhookIds: routeResult.webhookIds,
      silencedBy: silence ? silence.name : null,
    };
    if (event) {
      try {
        await this.eventRepo.update({ id: event.id }, { snapshot });
      } catch (e: any) {
        this.logger.warn(`Failed to persist notification snapshot. ruleId=${rule.id} err=${e?.message || e}`);
      }
    }

    const webhooks = allEnabledWebhooks.filter((w) => routeResult.webhookIds.includes(w.id));
    if (silence) {
      this.logger.log(`Alert notification silenced. ruleId=${rule.id} silence=${silence.name}`);
      return;
    }
    const msg = this.discord.buildAlertMessage({
      title: aiReport?.title || `${app?.name || scopedInstance?.name || 'Instance'}: ${rule.name}`,
      severity: rule.severity,
      appName: app?.name || scopedInstance?.name || 'Instance',
      job: app?.job || scopedInstance?.prometheusInstance || '-',
      appId: app?.id || undefined,
      ruleName: rule.name,
      ruleId: rule.id,
      kind: rule.kind,
      expr: snapshot?.primary?.expr,
      firingSince: firingSince.toISOString(),
      ai: aiReport,
      runbookUrl: String((rule.runbook as any)?.url || ''),
      runbookSteps: Array.isArray((rule.runbook as any)?.steps) ? (rule.runbook as any).steps : [],
    });
    let sentAny = false;
    for (const w of webhooks) {
      try {
        await this.discord.sendWebhook(w.discordUrl, msg);
        sentAny = true;
      } catch (e: any) {
        this.logger.warn(`Discord webhook failed. webhook=${w.name} err=${e?.message || e}`);
      }
    }

    const st = await this.stateRepo.findOne({ where: { ruleId: rule.id } });
    if (st) {
      if (sentAny) st.lastSentAt = new Date();
      await this.stateRepo.save(st);
    }
  }

  private async resolveRouteTargets(
    workspaceId: string | undefined,
    appId: string | undefined,
    instanceId: string | undefined,
    severity: Rule['severity'],
    defaultWebhookIds: string[],
    allEnabledWebhooks: Webhook[],
  ): Promise<{ routeName: string | null; webhookIds: string[] }> {
    const routes = await this.routeRepo.find({
      where: { enabled: true, workspaceId } as any,
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    for (const route of routes) {
      if (route.appId && route.appId !== (appId || null)) continue;
      if (route.instanceId && route.instanceId !== instanceId) continue;
      if (route.severity && route.severity !== severity) continue;
      const ids = Array.isArray(route.webhookIds) ? route.webhookIds : [];
      const allowed = new Set(allEnabledWebhooks.map((w) => w.id));
      const filtered = ids.filter((id) => allowed.has(id));
      return {
        routeName: route.name,
        webhookIds: filtered,
      };
    }
    return {
      routeName: null,
      webhookIds: defaultWebhookIds,
    };
  }

  private async findActiveSilence(
    workspaceId: string | undefined,
    appId: string | undefined,
    instanceId: string | undefined,
    severity: Rule['severity'],
    now: Date,
  ): Promise<NotificationSilence | null> {
    const silences = await this.silenceRepo.find({
      where: { enabled: true, workspaceId } as any,
      order: { createdAt: 'DESC' },
    });
    for (const s of silences) {
      if (s.appId && s.appId !== (appId || null)) continue;
      if (s.instanceId && s.instanceId !== instanceId) continue;
      if (s.severity && s.severity !== severity) continue;
      if (!this.isSilenceActiveNow(s, now)) continue;
      return s;
    }
    return null;
  }

  private isSilenceActiveNow(silence: NotificationSilence, now: Date): boolean {
    const parts = this.toLocalParts(now, silence.timezone || 'UTC');
    if (!parts) return false;
    const minute = parts.hour * 60 + parts.minute;
    const start = this.parseHm(silence.startTime);
    const end = this.parseHm(silence.endTime);
    if (start === null || end === null) return false;

    const days = Array.isArray(silence.daysOfWeek) ? silence.daysOfWeek : [];
    const allowAllDays = days.length === 0;
    const today = parts.weekday;
    const prevDay = (today + 6) % 7;
    const dayAllowed = (d: number) => allowAllDays || days.includes(d);

    if (start === end) {
      return dayAllowed(today);
    }
    if (start < end) {
      return dayAllowed(today) && minute >= start && minute < end;
    }
    return (dayAllowed(today) && minute >= start) || (dayAllowed(prevDay) && minute < end);
  }

  private parseHm(hm: string | null | undefined): number | null {
    const m = String(hm || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  private toLocalParts(now: Date, timeZone: string): { weekday: number; hour: number; minute: number } | null {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || '';
      const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
      const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
      const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const weekday = weekdayMap[weekdayStr];
      if (!Number.isInteger(weekday) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      return { weekday, hour, minute };
    } catch {
      return null;
    }
  }
}
