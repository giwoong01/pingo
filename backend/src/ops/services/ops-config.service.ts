import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cluster } from '../entities/cluster.entity';
import { App } from '../entities/app.entity';
import { Instance } from '../entities/instance.entity';
import { Webhook } from '../entities/webhook.entity';
import { Rule } from '../entities/rule.entity';
import { RuleWebhook } from '../entities/rule-webhook.entity';
import { NotificationRoute } from '../entities/notification-route.entity';
import { NotificationSilence } from '../entities/notification-silence.entity';
import { ImportOpsConfigDto, OpsConfigExportBundle } from '../dto/ops-config.dto';

type ImportSummaryRow = { created: number; updated: number; skipped: number };
type ImportSummary = {
  dryRun: boolean;
  clusters: ImportSummaryRow;
  apps: ImportSummaryRow;
  instances: ImportSummaryRow;
  webhooks: ImportSummaryRow;
  rules: ImportSummaryRow;
  notificationRoutes: ImportSummaryRow;
  notificationSilences: ImportSummaryRow;
  errors: string[];
};

@Injectable()
export class OpsConfigService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    @InjectRepository(Instance) private readonly instanceRepo: Repository<Instance>,
    @InjectRepository(Webhook) private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(Rule) private readonly ruleRepo: Repository<Rule>,
    @InjectRepository(RuleWebhook) private readonly ruleWebhookRepo: Repository<RuleWebhook>,
    @InjectRepository(NotificationRoute) private readonly routeRepo: Repository<NotificationRoute>,
    @InjectRepository(NotificationSilence) private readonly silenceRepo: Repository<NotificationSilence>,
  ) {}

  async exportWorkspace(workspaceId: string, includeSecrets = false): Promise<OpsConfigExportBundle> {
    const [clusters, apps, instances, webhooks, rules, routes, silences] = await Promise.all([
      this.clusterRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
      this.appRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
      this.instanceRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
      this.webhookRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
      this.ruleRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
      this.routeRepo.find({ where: { workspaceId } as any, order: { priority: 'ASC', createdAt: 'ASC' } }),
      this.silenceRepo.find({ where: { workspaceId } as any, order: { createdAt: 'ASC' } }),
    ]);

    const clusterById = new Map(clusters.map((x) => [x.id, x]));
    const appById = new Map(apps.map((x) => [x.id, x]));
    const instanceById = new Map(instances.map((x) => [x.id, x]));
    const webhookById = new Map(webhooks.map((x) => [x.id, x]));
    const ruleIds = rules.map((x) => x.id);
    const links = ruleIds.length
      ? await this.ruleWebhookRepo.find({ where: { ruleId: In(ruleIds) } })
      : [];
    const linksByRuleId = new Map<string, string[]>();
    for (const link of links) {
      const arr = linksByRuleId.get(link.ruleId) ?? [];
      arr.push(link.webhookId);
      linksByRuleId.set(link.ruleId, arr);
    }

    return {
      workspaceId,
      version: 'aegis.ops.config.v1',
      exportedAt: new Date().toISOString(),
      data: {
        clusters: clusters.map((c) => ({
          name: c.name,
          prometheusUrl: c.prometheusUrl,
          enabled: c.enabled,
          bearerTokenEnc: includeSecrets ? c.bearerTokenEnc : null,
          hasBearerToken: Boolean(c.bearerTokenEnc),
        })),
        apps: apps.map((a) => ({
          name: a.name,
          owner: a.owner,
          clusterName: clusterById.get(a.clusterId)?.name || null,
          job: a.job,
          enabled: a.enabled,
          widgetLayout: a.widgetLayout ?? null,
        })),
        instances: instances.map((i) => ({
          name: i.name,
          owner: i.owner,
          clusterName: clusterById.get(i.clusterId)?.name || null,
          appJob: i.appId ? appById.get(i.appId)?.job || null : null,
          provider: i.provider,
          publicIp: i.publicIp,
          privateIp: i.privateIp,
          region: i.region,
          env: i.env,
          prometheusInstance: i.prometheusInstance,
          enabled: i.enabled,
          widgetLayout: i.widgetLayout ?? null,
        })),
        webhooks: webhooks.map((w) => ({
          name: w.name,
          enabled: w.enabled,
          discordUrl: includeSecrets ? w.discordUrl : null,
          hasDiscordUrl: Boolean(w.discordUrl),
        })),
        rules: rules.map((r) => ({
          name: r.name,
          appJob: r.appId ? appById.get(r.appId)?.job || null : null,
          instancePrometheusInstance: r.instanceId ? instanceById.get(r.instanceId)?.prometheusInstance || null : null,
          severity: r.severity,
          kind: r.kind,
          expr: r.expr,
          intervalSeconds: r.intervalSeconds,
          forSeconds: r.forSeconds,
          cooldownSeconds: r.cooldownSeconds,
          enabled: r.enabled,
          runbook: r.runbook ?? null,
          webhookMode: (linksByRuleId.get(r.id) ?? []).length > 0 ? 'SELECTED' : 'ALL',
          webhookNames: (linksByRuleId.get(r.id) ?? [])
            .map((id) => webhookById.get(id)?.name || null)
            .filter((x): x is string => Boolean(x)),
        })),
        notificationRoutes: routes.map((x) => ({
          name: x.name,
          enabled: x.enabled,
          priority: x.priority,
          appJob: x.appId ? appById.get(x.appId)?.job || null : null,
          instancePrometheusInstance: x.instanceId ? instanceById.get(x.instanceId)?.prometheusInstance || null : null,
          severity: x.severity,
          webhookNames: (x.webhookIds || [])
            .map((id) => webhookById.get(id)?.name || null)
            .filter((n): n is string => Boolean(n)),
        })),
        notificationSilences: silences.map((x) => ({
          name: x.name,
          enabled: x.enabled,
          appJob: x.appId ? appById.get(x.appId)?.job || null : null,
          instancePrometheusInstance: x.instanceId ? instanceById.get(x.instanceId)?.prometheusInstance || null : null,
          severity: x.severity,
          timezone: x.timezone,
          daysOfWeek: x.daysOfWeek || [],
          startTime: x.startTime,
          endTime: x.endTime,
        })),
      },
    };
  }

  async importWorkspace(workspaceId: string, dto: ImportOpsConfigDto) {
    const dryRun = dto?.dryRun === true;
    const data = dto?.bundle?.data || dto?.data;
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('bundle.data or data is required');
    }

    if (dryRun) {
      return this.runImport(workspaceId, data as any, true);
    }

    return this.dataSource.transaction(async (tx) => {
      const service = new OpsConfigService(
        this.dataSource,
        tx.getRepository(Cluster),
        tx.getRepository(App),
        tx.getRepository(Instance),
        tx.getRepository(Webhook),
        tx.getRepository(Rule),
        tx.getRepository(RuleWebhook),
        tx.getRepository(NotificationRoute),
        tx.getRepository(NotificationSilence),
      );
      return service.runImport(workspaceId, data as any, false);
    });
  }

  private async runImport(workspaceId: string, data: any, dryRun: boolean): Promise<ImportSummary> {
    const summary: ImportSummary = {
      dryRun,
      clusters: { created: 0, updated: 0, skipped: 0 },
      apps: { created: 0, updated: 0, skipped: 0 },
      instances: { created: 0, updated: 0, skipped: 0 },
      webhooks: { created: 0, updated: 0, skipped: 0 },
      rules: { created: 0, updated: 0, skipped: 0 },
      notificationRoutes: { created: 0, updated: 0, skipped: 0 },
      notificationSilences: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    const clusters = Array.isArray(data.clusters) ? data.clusters : [];
    const apps = Array.isArray(data.apps) ? data.apps : [];
    const instances = Array.isArray(data.instances) ? data.instances : [];
    const webhooks = Array.isArray(data.webhooks) ? data.webhooks : [];
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const routes = Array.isArray(data.notificationRoutes) ? data.notificationRoutes : [];
    const silences = Array.isArray(data.notificationSilences) ? data.notificationSilences : [];

    const clusterByName = new Map<string, Cluster>();
    const appByJob = new Map<string, App>();
    const instanceByProm = new Map<string, Instance>();
    const webhookByName = new Map<string, Webhook>();

    for (const raw of clusters) {
      const name = String(raw?.name || '').trim();
      if (!name) {
        summary.clusters.skipped += 1;
        summary.errors.push('cluster: missing name');
        continue;
      }
      const existing = await this.clusterRepo.findOne({ where: { workspaceId, name } as any });
      const patch: Partial<Cluster> = {
        prometheusUrl: String(raw?.prometheusUrl || '').trim() || 'http://localhost:9090/api/v1/query',
        enabled: raw?.enabled !== false,
      };
      const incomingToken = String(raw?.bearerTokenEnc || '').trim();
      if (incomingToken) patch.bearerTokenEnc = incomingToken;
      if (!existing) {
        summary.clusters.created += 1;
        if (!dryRun) {
          const saved = await this.clusterRepo.save(this.clusterRepo.create(patch as Cluster));
          clusterByName.set(saved.name, saved);
        }
      } else {
        summary.clusters.updated += 1;
        if (!dryRun) {
          const saved = await this.clusterRepo.save({ ...existing, ...patch });
          clusterByName.set(saved.name, saved);
        }
      }
      if (dryRun) {
        const snapshot = existing || this.clusterRepo.create(patch as Cluster);
        clusterByName.set(name, { ...snapshot, ...patch } as Cluster);
      }
    }

    for (const raw of apps) {
      const job = String(raw?.job || '').trim();
      const name = String(raw?.name || '').trim();
      const clusterName = String(raw?.clusterName || '').trim();
      if (!job || !name || !clusterName) {
        summary.apps.skipped += 1;
        summary.errors.push(`app: missing required fields (name/job/clusterName). job=${job || '-'}`);
        continue;
      }
      const cluster = clusterByName.get(clusterName);
      if (!cluster) {
        summary.apps.skipped += 1;
        summary.errors.push(`app: cluster not found. clusterName=${clusterName} job=${job}`);
        continue;
      }
      const existing = await this.appRepo.findOne({ where: { workspaceId, clusterId: cluster.id, job } as any });
      const patch: Partial<App> = {
        clusterId: cluster.id,
        owner: raw?.owner ? String(raw.owner) : null,
        enabled: raw?.enabled !== false,
        widgetLayout: Array.isArray(raw?.widgetLayout) ? raw.widgetLayout : null,
      };
      if (!existing) {
        summary.apps.created += 1;
        if (!dryRun) {
          const saved = await this.appRepo.save(this.appRepo.create(patch as App));
          appByJob.set(saved.job, saved);
        }
      } else {
        summary.apps.updated += 1;
        if (!dryRun) {
          const saved = await this.appRepo.save({ ...existing, ...patch });
          appByJob.set(saved.job, saved);
        }
      }
      if (dryRun) {
        const snapshot = existing || this.appRepo.create(patch as App);
        appByJob.set(job, { ...snapshot, ...patch } as App);
      }
    }

    for (const raw of instances) {
      const prometheusInstance = String(raw?.prometheusInstance || '').trim();
      const name = String(raw?.name || '').trim();
      const clusterName = String(raw?.clusterName || '').trim();
      if (!prometheusInstance || !name || !clusterName) {
        summary.instances.skipped += 1;
        summary.errors.push(`instance: missing required fields (name/prometheusInstance/clusterName). instance=${prometheusInstance || '-'}`);
        continue;
      }
      const cluster = clusterByName.get(clusterName);
      if (!cluster) {
        summary.instances.skipped += 1;
        summary.errors.push(`instance: cluster not found. clusterName=${clusterName} instance=${prometheusInstance}`);
        continue;
      }
      const appJob = String(raw?.appJob || '').trim();
      const app = appJob ? appByJob.get(appJob) : null;
      if (appJob && !app) {
        summary.instances.skipped += 1;
        summary.errors.push(`instance: appJob not found. appJob=${appJob} instance=${prometheusInstance}`);
        continue;
      }

      const existing = await this.instanceRepo.findOne({
        where: { workspaceId, clusterId: cluster.id, prometheusInstance } as any,
      });
      const patch: Partial<Instance> = {
        clusterId: cluster.id,
        appId: app?.id || null,
        owner: raw?.owner ? String(raw.owner) : null,
        provider: String(raw?.provider || 'oracle'),
        publicIp: raw?.publicIp ? String(raw.publicIp) : null,
        privateIp: raw?.privateIp ? String(raw.privateIp) : null,
        region: raw?.region ? String(raw.region) : null,
        env: raw?.env ? String(raw.env) : null,
        enabled: raw?.enabled !== false,
        widgetLayout: Array.isArray(raw?.widgetLayout) ? raw.widgetLayout : null,
      };
      if (!existing) {
        summary.instances.created += 1;
        if (!dryRun) {
          const saved = await this.instanceRepo.save(this.instanceRepo.create(patch as Instance));
          instanceByProm.set(saved.prometheusInstance, saved);
        }
      } else {
        summary.instances.updated += 1;
        if (!dryRun) {
          const saved = await this.instanceRepo.save({ ...existing, ...patch });
          instanceByProm.set(saved.prometheusInstance, saved);
        }
      }
      if (dryRun) {
        const snapshot = existing || this.instanceRepo.create(patch as Instance);
        instanceByProm.set(prometheusInstance, { ...snapshot, ...patch } as Instance);
      }
    }

    for (const raw of webhooks) {
      const name = String(raw?.name || '').trim();
      if (!name) {
        summary.webhooks.skipped += 1;
        summary.errors.push('webhook: missing name');
        continue;
      }
      const existing = await this.webhookRepo.findOne({ where: { workspaceId, name } as any });
      const incomingUrl = String(raw?.discordUrl || '').trim();
      if (!existing && !incomingUrl) {
        summary.webhooks.skipped += 1;
        summary.errors.push(`webhook: discordUrl required for create. name=${name}`);
        continue;
      }
      const patch: Partial<Webhook> = {
        enabled: raw?.enabled !== false,
      };
      if (incomingUrl) patch.discordUrl = incomingUrl;
      if (!existing) {
        summary.webhooks.created += 1;
        if (!dryRun) {
          const saved = await this.webhookRepo.save(this.webhookRepo.create(patch as Webhook));
          webhookByName.set(saved.name, saved);
        }
      } else {
        summary.webhooks.updated += 1;
        if (!dryRun) {
          const saved = await this.webhookRepo.save({ ...existing, ...patch });
          webhookByName.set(saved.name, saved);
        }
      }
      if (dryRun) {
        const snapshot = existing || this.webhookRepo.create({ ...(patch as any), discordUrl: incomingUrl || '' });
        webhookByName.set(name, { ...snapshot, ...patch } as Webhook);
      }
    }

    for (const raw of rules) {
      const name = String(raw?.name || '').trim();
      const appJob = String(raw?.appJob || '').trim();
      if (!name || !appJob) {
        summary.rules.skipped += 1;
        summary.errors.push(`rule: missing required fields (name/appJob). name=${name || '-'} appJob=${appJob || '-'}`);
        continue;
      }
      const app = appByJob.get(appJob);
      if (!app) {
        summary.rules.skipped += 1;
        summary.errors.push(`rule: appJob not found. appJob=${appJob} name=${name}`);
        continue;
      }
      const instanceProm = String(raw?.instancePrometheusInstance || '').trim();
      const instance = instanceProm ? instanceByProm.get(instanceProm) : null;
      if (instanceProm && !instance) {
        summary.rules.skipped += 1;
        summary.errors.push(`rule: instancePrometheusInstance not found. instance=${instanceProm} rule=${name}`);
        continue;
      }
      const existing = await this.ruleRepo.findOne({ where: { workspaceId, appId: app.id, name } as any });
      const patch: Partial<Rule> = {
        appId: app.id,
        instanceId: instance?.id || null,
        severity: String(raw?.severity || 'MEDIUM') as any,
        kind: String(raw?.kind || 'CUSTOM') as any,
        expr: String(raw?.expr || '').trim(),
        intervalSeconds: Number(raw?.intervalSeconds || 60),
        forSeconds: Number(raw?.forSeconds || 60),
        cooldownSeconds: Number(raw?.cooldownSeconds || 600),
        enabled: raw?.enabled !== false,
        runbook: raw?.runbook && typeof raw.runbook === 'object' ? raw.runbook : null,
      };
      if (!patch.expr) {
        summary.rules.skipped += 1;
        summary.errors.push(`rule: expr is required. name=${name}`);
        continue;
      }
      let ruleEntity: Rule;
      if (!existing) {
        summary.rules.created += 1;
        ruleEntity = dryRun ? ({ id: `dry-${name}`, ...patch } as Rule) : await this.ruleRepo.save(this.ruleRepo.create(patch as Rule));
      } else {
        summary.rules.updated += 1;
        ruleEntity = dryRun ? ({ ...existing, ...patch } as Rule) : await this.ruleRepo.save({ ...existing, ...patch });
      }

      const webhookNames = Array.isArray(raw?.webhookNames) ? raw.webhookNames.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
      const mode = String(raw?.webhookMode || '').toUpperCase();
      if (!dryRun) {
        await this.ruleWebhookRepo.delete({ ruleId: ruleEntity.id });
      }
      if (mode === 'SELECTED' || webhookNames.length > 0) {
        const webhookIds: string[] = [];
        for (const hookName of webhookNames) {
          const hook = webhookByName.get(hookName);
          if (!hook) {
            summary.errors.push(`rule webhook: webhook not found. rule=${name} webhook=${hookName}`);
            continue;
          }
          webhookIds.push(hook.id);
        }
        if (!dryRun && webhookIds.length > 0) {
          await this.ruleWebhookRepo.save(
            webhookIds.map((webhookId) =>
              this.ruleWebhookRepo.create({
                ruleId: ruleEntity.id,
              }),
            ),
          );
        }
      }
    }

    for (const raw of routes) {
      const name = String(raw?.name || '').trim();
      if (!name) {
        summary.notificationRoutes.skipped += 1;
        summary.errors.push('notificationRoute: missing name');
        continue;
      }
      const appJob = String(raw?.appJob || '').trim();
      const instanceProm = String(raw?.instancePrometheusInstance || '').trim();
      const app = appJob ? appByJob.get(appJob) : null;
      const instance = instanceProm ? instanceByProm.get(instanceProm) : null;
      if (appJob && !app) {
        summary.notificationRoutes.skipped += 1;
        summary.errors.push(`notificationRoute: appJob not found. route=${name} appJob=${appJob}`);
        continue;
      }
      if (instanceProm && !instance) {
        summary.notificationRoutes.skipped += 1;
        summary.errors.push(`notificationRoute: instance not found. route=${name} instance=${instanceProm}`);
        continue;
      }
      const webhookNames = Array.isArray(raw?.webhookNames) ? raw.webhookNames.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
      const webhookIds = webhookNames
        .map((hookName: string) => webhookByName.get(hookName)?.id || null)
        .filter((x: string | null): x is string => Boolean(x));

      const existing = await this.routeRepo.findOne({ where: { workspaceId, name } as any });
      const severity = raw?.severity ? String(raw.severity).toUpperCase() : null;
      const patch: Partial<NotificationRoute> = {
        enabled: raw?.enabled !== false,
        priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : 100,
        appId: app?.id || null,
        instanceId: instance?.id || null,
        severity: severity as any,
      };
      if (!existing) {
        summary.notificationRoutes.created += 1;
        if (!dryRun) await this.routeRepo.save(this.routeRepo.create(patch as NotificationRoute));
      } else {
        summary.notificationRoutes.updated += 1;
        if (!dryRun) await this.routeRepo.save({ ...existing, ...patch });
      }
    }

    for (const raw of silences) {
      const name = String(raw?.name || '').trim();
      if (!name) {
        summary.notificationSilences.skipped += 1;
        summary.errors.push('notificationSilence: missing name');
        continue;
      }
      const appJob = String(raw?.appJob || '').trim();
      const instanceProm = String(raw?.instancePrometheusInstance || '').trim();
      const app = appJob ? appByJob.get(appJob) : null;
      const instance = instanceProm ? instanceByProm.get(instanceProm) : null;
      if (appJob && !app) {
        summary.notificationSilences.skipped += 1;
        summary.errors.push(`notificationSilence: appJob not found. silence=${name} appJob=${appJob}`);
        continue;
      }
      if (instanceProm && !instance) {
        summary.notificationSilences.skipped += 1;
        summary.errors.push(`notificationSilence: instance not found. silence=${name} instance=${instanceProm}`);
        continue;
      }
      const existing = await this.silenceRepo.findOne({ where: { workspaceId, name } as any });
      const days = Array.isArray(raw?.daysOfWeek) ? raw.daysOfWeek.map((x: any) => Number(x)).filter((n: number) => n >= 0 && n <= 6) : [];
      const severity = raw?.severity ? String(raw.severity).toUpperCase() : null;
      const patch: Partial<NotificationSilence> = {
        enabled: raw?.enabled !== false,
        appId: app?.id || null,
        instanceId: instance?.id || null,
        severity: severity as any,
        timezone: String(raw?.timezone || 'UTC'),
        daysOfWeek: days,
        startTime: String(raw?.startTime || '00:00'),
        endTime: String(raw?.endTime || '00:00'),
      };
      if (!existing) {
        summary.notificationSilences.created += 1;
        if (!dryRun) await this.silenceRepo.save(this.silenceRepo.create(patch as NotificationSilence));
      } else {
        summary.notificationSilences.updated += 1;
        if (!dryRun) await this.silenceRepo.save({ ...existing, ...patch });
      }
    }

    return summary;
  }
}
