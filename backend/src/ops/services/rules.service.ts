import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Rule } from '../entities/rule.entity';
import { CreateRuleDto, CreateRuleFromPresetDto, RuleWebhookMode, UpdateRuleDto } from '../dto/rule.dto';
import { App } from '../entities/app.entity';
import { Instance } from '../entities/instance.entity';
import { PresetsService } from './presets.service';
import { ClustersService } from './clusters.service';
import { PrometheusService } from './prometheus.service';
import { Cluster } from '../entities/cluster.entity';
import { RuleWebhook } from '../entities/rule-webhook.entity';
import { Webhook } from '../entities/webhook.entity';
import { AlertEvent } from '../entities/alert-event.entity';

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule) private readonly repo: Repository<Rule>,
    @InjectRepository(AlertEvent) private readonly alertRepo: Repository<AlertEvent>,
    @InjectRepository(RuleWebhook) private readonly linkRepo: Repository<RuleWebhook>,
    @InjectRepository(Webhook) private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    @InjectRepository(Instance) private readonly instanceRepo: Repository<Instance>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    private readonly presets: PresetsService,
    private readonly clusters: ClustersService,
    private readonly prom: PrometheusService,
  ) {}

  async list(workspaceId?: string, appId?: string, instanceId?: string) {
    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (appId) where.appId = appId;
    if (instanceId) where.instanceId = instanceId;
    const rules = await this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { createdAt: 'DESC' },
    });
    return this.attachWebhookConfig(rules, workspaceId);
  }

  async get(id: string, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const rule = await this.repo.findOne({ where });
    if (!rule) throw new NotFoundException('Rule not found');
    const [out] = await this.attachWebhookConfig([rule], workspaceId);
    return out;
  }

  async create(dto: CreateRuleDto, workspaceId: string) {
    const { appId, instanceId } = await this.resolveScope(dto.appId, dto.instanceId, workspaceId);
    const expr = String(dto.expr || '').trim();
    if (!expr) throw new BadRequestException('expr is required');
    if (!appId && expr.includes('${job}')) {
      throw new BadRequestException('This rule expression requires app context (${job}). Link instance to an app or set appId.');
    }
    const rule = this.repo.create({
      name: dto.name,
      severity: dto.severity ?? 'MEDIUM',
      kind: dto.kind ?? 'CUSTOM',
      intervalSeconds: dto.intervalSeconds ?? 60,
      forSeconds: dto.forSeconds ?? 60,
      cooldownSeconds: dto.cooldownSeconds ?? 600,
      enabled: dto.enabled ?? true,
      runbook: this.normalizeRunbook(dto.runbookUrl, dto.runbookSteps),
    });
    const saved = await this.repo.save(rule);
    await this.applyWebhookConfig(saved.id, dto.webhookMode, dto.webhookIds, workspaceId);
    return this.get(saved.id, workspaceId);
  }

  async createFromPreset(dto: CreateRuleFromPresetDto, workspaceId: string) {
    const { appId, instanceId } = await this.resolveScope(dto.appId, dto.instanceId, workspaceId);
    const preset = this.presets.getById(dto.presetId);
    if (!preset) throw new BadRequestException('Preset not found');
    if (!appId && preset.exprTemplate.includes('${job}')) {
      throw new BadRequestException('This preset requires app context (${job}). Link instance to an app or set appId.');
    }

    const threshold = (dto.threshold ?? preset.defaultThreshold ?? '').trim();
    if (preset.exprTemplate.includes('${threshold}') && !threshold) {
      throw new BadRequestException('threshold is required for this preset');
    }

    const expr = preset.exprTemplate.replace(/\$\{threshold\}/g, threshold);
    const rule = this.repo.create({
      name: dto.name,
      severity: dto.severity ?? 'MEDIUM',
      kind: preset.kind,
      intervalSeconds: dto.intervalSeconds ?? preset.defaultIntervalSeconds,
      forSeconds: dto.forSeconds ?? preset.defaultForSeconds,
      cooldownSeconds: dto.cooldownSeconds ?? preset.defaultCooldownSeconds,
      enabled: dto.enabled ?? true,
      runbook: this.normalizeRunbook(dto.runbookUrl, dto.runbookSteps),
    });
    const saved = await this.repo.save(rule);
    await this.applyWebhookConfig(saved.id, dto.webhookMode, dto.webhookIds, workspaceId);
    return this.get(saved.id, workspaceId);
  }

  async update(id: string, dto: UpdateRuleDto, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const existing = await this.repo.findOne({ where });
    if (!existing) throw new NotFoundException('Rule not found');
    const scopedWorkspaceId = workspaceId || existing.workspaceId || undefined;
    const prevEnabled = existing.enabled;
    const rule = existing;
    if (dto.instanceId !== undefined) {
      const scope = await this.resolveScope(rule.appId, dto.instanceId || null, scopedWorkspaceId);
      rule.appId = scope.appId;
      rule.instanceId = scope.instanceId;
    }
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.severity !== undefined) rule.severity = dto.severity;
    if (dto.kind !== undefined) rule.kind = dto.kind as any;
    if (dto.expr !== undefined) rule.expr = dto.expr;
    if (dto.intervalSeconds !== undefined) rule.intervalSeconds = dto.intervalSeconds;
    if (dto.forSeconds !== undefined) rule.forSeconds = dto.forSeconds;
    if (dto.cooldownSeconds !== undefined) rule.cooldownSeconds = dto.cooldownSeconds;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.runbookUrl !== undefined || dto.runbookSteps !== undefined) {
      const currentUrl = String((rule.runbook as any)?.url || '');
      const currentSteps = Array.isArray((rule.runbook as any)?.steps) ? ((rule.runbook as any).steps as string[]) : [];
      const nextUrl = dto.runbookUrl !== undefined ? dto.runbookUrl : currentUrl;
      const nextSteps = dto.runbookSteps !== undefined ? dto.runbookSteps : currentSteps;
      rule.runbook = this.normalizeRunbook(nextUrl, nextSteps);
    }
    const saved = await this.repo.save(rule);
    if (dto.enabled !== undefined && prevEnabled !== saved.enabled) {
      try {
        await this.alertRepo.save(
          this.alertRepo.create({
              ruleId: saved.id,
              workspaceId: saved.workspaceId,
              appId: saved.appId,
            status: saved.enabled ? 'ENABLED' : 'DISABLED',
            startedAt: new Date(),
            endedAt: null,
            value: null,
            snapshot: {
              type: 'rule_enabled_toggled',
              before: prevEnabled,
              after: saved.enabled,
            },
            aiReport: null,
          }),
        );
      } catch {
      }
    }
    await this.applyWebhookConfig(saved.id, dto.webhookMode, dto.webhookIds, scopedWorkspaceId);
    return this.get(saved.id, scopedWorkspaceId);
  }

  async remove(id: string, workspaceId?: string) {
    const rule = await this.get(id, workspaceId);
    const where: any = { id: rule.id };
    if (workspaceId) where.workspaceId = workspaceId;
    const ent = await this.repo.findOne({ where });
    if (ent) await this.repo.remove(ent);
    return { ok: true };
  }

  async testRule(id: string, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const rule = await this.repo.findOne({ where });
    if (!rule) throw new NotFoundException('Rule not found');
    const scopedWorkspaceId = workspaceId || rule.workspaceId || undefined;
    const app = rule.appId
      ? await this.appRepo.findOne({ where: { id: rule.appId, workspaceId: scopedWorkspaceId } as any })
      : null;
    const instance = rule.instanceId
      ? await this.instanceRepo.findOne({ where: { id: rule.instanceId, workspaceId: scopedWorkspaceId } as any })
      : null;
    const clusterId = app?.clusterId || instance?.clusterId;
    if (!clusterId) throw new BadRequestException('Rule scope is invalid: missing app/instance cluster context');
    const cluster = await this.clusterRepo.findOne({ where: { id: clusterId, workspaceId: scopedWorkspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const token = await this.clusters.resolveBearerToken(clusterId, scopedWorkspaceId);
    const expr = this.interpolate(rule.expr, app?.job || '', instance?.prometheusInstance || undefined);
    const value = await this.prom.queryScalarSum(cluster.prometheusUrl, expr, token);
    const firing = value !== null && value > 0;
    const links = await this.linkRepo.find({ where: { ruleId: rule.id } });
    const webhookMode: RuleWebhookMode = links.length > 0 ? 'SELECTED' : 'ALL';
    const webhookIds = links.map((l) => l.webhookId);
    return { ok: value !== null, firing, value, expr, webhookMode, webhookIds };
  }

  interpolate(expr: string, job: string, instance?: string): string {
    const safeJob = String(job || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeInstance = String(instance || '')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const instanceMatcher = safeInstance ? `,instance="${safeInstance}"` : '';
    const instanceMatcherOnly = safeInstance ? `instance="${safeInstance}"` : '';
    return String(expr || '')
      .replace(/\$\{job\}/g, safeJob)
      .replace(/\$\{instanceMatcher\}/g, instanceMatcher)
      .replace(/\$\{instanceMatcherOnly\}/g, instanceMatcherOnly);
  }

  private async attachWebhookConfig(rules: Rule[], workspaceId?: string) {
    if (!rules.length) return [];
    const ids = rules.map((r) => r.id);
    const links = await this.linkRepo.find({ where: { ruleId: In(ids) } });
    const byRule = new Map<string, string[]>();
    for (const l of links) {
      const arr = byRule.get(l.ruleId) ?? [];
      arr.push(l.webhookId);
      byRule.set(l.ruleId, arr);
    }
    return rules.map((r) => {
      const wh = byRule.get(r.id) ?? [];
      const webhookMode: RuleWebhookMode = wh.length > 0 ? 'SELECTED' : 'ALL';
      return { ...r, webhookMode, webhookIds: wh };
    });
  }

  private async applyWebhookConfig(ruleId: string, mode?: RuleWebhookMode, webhookIds?: string[], workspaceId?: string) {
    const m = (mode || '').toUpperCase();
    if (m === 'ALL') {
      await this.linkRepo.delete({ ruleId });
      return;
    }
    const wantsSelected = m === 'SELECTED' || Array.isArray(webhookIds);
    if (!wantsSelected) return;
    if (!Array.isArray(webhookIds) || webhookIds.length === 0) {
      throw new BadRequestException('webhookIds must contain at least one webhook when webhookMode=SELECTED');
    }
    const uniqueIds = Array.from(new Set(webhookIds.map((x) => String(x))));
    const where: any = { id: In(uniqueIds) };
    if (workspaceId) where.workspaceId = workspaceId;
    const hooks = await this.webhookRepo.find({ where });
    if (hooks.length !== uniqueIds.length) {
      throw new BadRequestException('One or more webhooks not found');
    }
    await this.linkRepo.delete({ ruleId });
    await this.linkRepo.save(uniqueIds.map((webhookId) => this.linkRepo.create({ ruleId, webhookId })));
  }

  private normalizeRunbook(url?: string, steps?: string[]) {
    const cleanUrl = String(url || '').trim();
    const cleanSteps = Array.isArray(steps)
      ? Array.from(
          new Set(
            steps
              .map((s) => String(s || '').trim())
              .filter((s) => s.length > 0)
              .slice(0, 12),
          ),
        )
      : [];
    if (!cleanUrl && cleanSteps.length === 0) return null;
    return {
      url: cleanUrl || undefined,
      steps: cleanSteps.length > 0 ? cleanSteps : undefined,
    };
  }

  private async resolveScope(appIdInput?: string | null, instanceIdInput?: string | null, workspaceId?: string) {
    const appId = String(appIdInput || '').trim() || null;
    const instanceId = String(instanceIdInput || '').trim() || null;
    if (!appId && !instanceId) {
      throw new BadRequestException('Either appId or instanceId is required');
    }
    const [app, instance] = await Promise.all([
      appId ? this.appRepo.findOne({ where: { id: appId, workspaceId } as any }) : Promise.resolve(null),
      instanceId ? this.instanceRepo.findOne({ where: { id: instanceId, workspaceId } as any }) : Promise.resolve(null),
    ]);
    if (appId && !app) throw new BadRequestException('App not found');
    if (instanceId && !instance) throw new BadRequestException('Instance not found');

    if (app && instance) {
      if (instance.clusterId !== app.clusterId) {
        throw new BadRequestException('App and instance clusterId must match');
      }
      if (instance.appId && instance.appId !== app.id) {
        throw new BadRequestException('Instance is already linked to another app');
      }
    }

    const resolvedAppId = app?.id || instance?.appId || null;
    return { appId: resolvedAppId, instanceId: instance?.id || instanceId || null };
  }
}
