import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Instance } from '../entities/instance.entity';
import { Cluster } from '../entities/cluster.entity';
import { App } from '../entities/app.entity';
import { CreateInstanceDto, UpdateInstanceDto } from '../dto/instance.dto';
import { PrometheusService } from './prometheus.service';
import { ClustersService } from './clusters.service';

@Injectable()
export class InstancesService {
  constructor(
    @InjectRepository(Instance) private readonly repo: Repository<Instance>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    private readonly prom: PrometheusService,
    private readonly clusters: ClustersService,
  ) {}

  list(workspaceId?: string) {
    const where = workspaceId ? ([{ workspaceId }, { workspaceId: IsNull() }] as any) : undefined;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async get(id: string, workspaceId?: string) {
    const where: any = workspaceId ? [{ id, workspaceId }, { id, workspaceId: IsNull() }] : { id };
    const instance = await this.repo.findOne({ where });
    if (!instance) throw new NotFoundException('Instance not found');
    return instance;
  }

  async create(dto: CreateInstanceDto, workspaceId: string) {
    const cluster = await this.clusterRepo.findOne({ where: { id: dto.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const appId = dto.appId ?? null;
    if (appId) {
      const app = await this.appRepo.findOne({ where: { id: appId, workspaceId } as any });
      if (!app) throw new BadRequestException('App not found');
      if (app.clusterId !== dto.clusterId) throw new BadRequestException('App and instance clusterId must match');
    }
    const instance = this.repo.create({
      workspaceId,
      clusterId: dto.clusterId,
      appId,
      name: dto.name,
      owner: dto.owner?.trim() || null,
      provider: dto.provider,
      publicIp: dto.publicIp ?? null,
      privateIp: dto.privateIp ?? null,
      region: dto.region ?? null,
      env: dto.env ?? null,
      prometheusInstance: dto.prometheusInstance,
      enabled: dto.enabled ?? true,
    });
    return this.repo.save(instance);
  }

  async update(id: string, dto: UpdateInstanceDto, workspaceId?: string) {
    const instance = await this.get(id, workspaceId);
    const scopedWorkspaceId = workspaceId || instance.workspaceId || undefined;
    const nextClusterId = dto.clusterId ?? instance.clusterId;
    if (dto.clusterId !== undefined) {
      const cluster = await this.clusterRepo.findOne({ where: { id: dto.clusterId, workspaceId: scopedWorkspaceId } as any });
      if (!cluster) throw new BadRequestException('Cluster not found');
      instance.clusterId = dto.clusterId;
    }
    if (dto.appId !== undefined) {
      if (!dto.appId) {
        instance.appId = null;
      } else {
        const app = await this.appRepo.findOne({ where: { id: dto.appId, workspaceId: scopedWorkspaceId } as any });
        if (!app) throw new BadRequestException('App not found');
        if (app.clusterId !== nextClusterId) throw new BadRequestException('App and instance clusterId must match');
        instance.appId = dto.appId;
      }
    }
    if (dto.name !== undefined) instance.name = dto.name;
    if (dto.owner !== undefined) instance.owner = dto.owner?.trim() || null;
    if (dto.provider !== undefined) instance.provider = dto.provider;
    if (dto.publicIp !== undefined) instance.publicIp = dto.publicIp || null;
    if (dto.privateIp !== undefined) instance.privateIp = dto.privateIp || null;
    if (dto.region !== undefined) instance.region = dto.region || null;
    if (dto.env !== undefined) instance.env = dto.env || null;
    if (dto.prometheusInstance !== undefined) instance.prometheusInstance = dto.prometheusInstance;
    if (dto.enabled !== undefined) instance.enabled = dto.enabled;
    return this.repo.save(instance);
  }

  async remove(id: string, workspaceId?: string) {
    const instance = await this.get(id, workspaceId);
    await this.repo.remove(instance);
    return { ok: true };
  }

  async getWidgetLayout(id: string, workspaceId?: string) {
    const instance = await this.get(id, workspaceId);
    return { widgets: Array.isArray(instance.widgetLayout) ? instance.widgetLayout : null };
  }

  async saveWidgetLayout(id: string, widgets: any, workspaceId?: string) {
    const instance = await this.get(id, workspaceId);
    if (!Array.isArray(widgets)) throw new BadRequestException('widgets must be array');
    if (widgets.length > 200) throw new BadRequestException('too many widgets');
    instance.widgetLayout = widgets;
    await this.repo.save(instance);
    return { widgets: instance.widgetLayout || [] };
  }

  async discover(clusterId: string, workspaceId?: string) {
    const cluster = await this.clusters.get(clusterId, workspaceId);
    const token = await this.clusters.resolveBearerToken(clusterId, workspaceId);
    const values = await this.prom.labelValues(cluster.prometheusUrl, 'instance', token);
    const targets = (values ?? []).filter((x) => String(x || '').trim().length > 0).sort();
    return { ok: values !== null, instances: targets, targets, count: targets.length };
  }

  async test(id: string, workspaceId?: string) {
    const target = await this.get(id, workspaceId);
    const scopedWorkspaceId = workspaceId || target.workspaceId || undefined;
    const cluster = await this.clusters.get(target.clusterId, scopedWorkspaceId);
    const token = await this.clusters.resolveBearerToken(target.clusterId, scopedWorkspaceId);
    const safeInstance = String(target.prometheusInstance || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const qCount = `count(up{instance="${safeInstance}"})`;
    const qUpSum = `sum(up{instance="${safeInstance}"})`;
    const seriesCount = await this.prom.queryScalarSum(cluster.prometheusUrl, qCount, token);
    const upSum = await this.prom.queryScalarSum(cluster.prometheusUrl, qUpSum, token);
    return {
      ok: upSum !== null && upSum > 0,
      upSum,
      seriesCount,
      queries: { upSum: qUpSum, seriesCount: qCount },
    };
  }
}
