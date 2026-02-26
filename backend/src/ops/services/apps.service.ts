import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { App } from '../entities/app.entity';
import { CreateAppDto, UpdateAppDto } from '../dto/app.dto';
import { Cluster } from '../entities/cluster.entity';
import { PrometheusService, PromTarget } from './prometheus.service';
import { ClustersService } from './clusters.service';

@Injectable()
export class AppsService {
  constructor(
    @InjectRepository(App) private readonly repo: Repository<App>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    private readonly prom: PrometheusService,
    private readonly clusters: ClustersService,
  ) {}

  list(workspaceId?: string) {
    const where = workspaceId ? ([{ workspaceId }, { workspaceId: IsNull() }] as any) : undefined;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async get(id: string, workspaceId?: string) {
    const where: any = workspaceId ? [{ id, workspaceId }, { id, workspaceId: IsNull() }] : { id };
    const app = await this.repo.findOne({ where });
    if (!app) throw new NotFoundException('App not found');
    return app;
  }

  async create(dto: CreateAppDto, workspaceId: string) {
    const cluster = await this.clusterRepo.findOne({ where: { id: dto.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const app = this.repo.create({
      workspaceId,
      clusterId: dto.clusterId,
      name: dto.name,
      owner: dto.owner?.trim() || null,
      job: dto.job,
      enabled: dto.enabled ?? true,
    });
    return this.repo.save(app);
  }

  async update(id: string, dto: UpdateAppDto, workspaceId?: string) {
    const app = await this.get(id, workspaceId);
    const scopedWorkspaceId = workspaceId || app.workspaceId || undefined;
    if (dto.clusterId !== undefined) {
      const cluster = await this.clusterRepo.findOne({ where: { id: dto.clusterId, workspaceId: scopedWorkspaceId } as any });
      if (!cluster) throw new BadRequestException('Cluster not found');
      app.clusterId = dto.clusterId;
    }
    if (dto.name !== undefined) app.name = dto.name;
    if (dto.owner !== undefined) app.owner = dto.owner?.trim() || null;
    if (dto.job !== undefined) app.job = dto.job;
    if (dto.enabled !== undefined) app.enabled = dto.enabled;
    return this.repo.save(app);
  }

  async remove(id: string, workspaceId?: string) {
    const app = await this.get(id, workspaceId);
    await this.repo.remove(app);
    return { ok: true };
  }

  async getWidgetLayout(id: string, workspaceId?: string) {
    const app = await this.get(id, workspaceId);
    return { widgets: Array.isArray(app.widgetLayout) ? app.widgetLayout : null };
  }

  async saveWidgetLayout(id: string, widgets: any, workspaceId?: string) {
    const app = await this.get(id, workspaceId);
    if (!Array.isArray(widgets)) throw new BadRequestException('widgets must be array');
    if (widgets.length > 200) throw new BadRequestException('too many widgets');
    app.widgetLayout = widgets;
    await this.repo.save(app);
    return { widgets: app.widgetLayout || [] };
  }

  async testJob(appId: string, workspaceId?: string) {
    const app = await this.get(appId, workspaceId);
    const scopedWorkspaceId = workspaceId || app.workspaceId || undefined;
    const cluster = await this.clusters.get(app.clusterId, scopedWorkspaceId);
    const token = await this.clusters.resolveBearerToken(app.clusterId, scopedWorkspaceId);
    const safeJob = this.escapeLabelValue(app.job);
    const qCount = `count(up{job="${safeJob}"})`;
    const qUpSum = `sum(up{job="${safeJob}"})`;
    const seriesCount = await this.prom.queryScalarSum(cluster.prometheusUrl, qCount, token);
    const upSum = await this.prom.queryScalarSum(cluster.prometheusUrl, qUpSum, token);
    return {
      ok: upSum !== null && upSum > 0,
      upSum,
      seriesCount,
      queries: { upSum: qUpSum, seriesCount: qCount },
    };
  }

  async targets(appId: string, workspaceId?: string) {
    const app = await this.get(appId, workspaceId);
    const scopedWorkspaceId = workspaceId || app.workspaceId || undefined;
    const cluster = await this.clusters.get(app.clusterId, scopedWorkspaceId);
    const token = await this.clusters.resolveBearerToken(app.clusterId, scopedWorkspaceId);

    const targets = await this.prom.targets(cluster.prometheusUrl, token);
    const filtered = (targets || []).filter((t: PromTarget) => String(t?.labels?.job || '') === String(app.job || ''));

    return {
      app: { id: app.id, name: app.name, job: app.job, clusterId: app.clusterId },
      targets: filtered.map((t) => ({
        job: t?.labels?.job || '',
        instance: t?.labels?.instance || '',
        health: t?.health || '',
        lastScrape: t?.lastScrape || null,
        lastError: t?.lastError || '',
        scrapeUrl: t?.scrapeUrl || '',
        lastScrapeDuration: typeof t?.lastScrapeDuration === 'number' ? t.lastScrapeDuration : null,
        scrapeInterval: t?.scrapeInterval || '',
        scrapeTimeout: t?.scrapeTimeout || '',
      })),
    };
  }

  private escapeLabelValue(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
