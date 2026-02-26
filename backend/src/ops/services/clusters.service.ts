import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Cluster } from '../entities/cluster.entity';
import { CreateClusterDto, UpdateClusterDto } from '../dto/cluster.dto';
import { CryptoService } from './crypto.service';
import { PrometheusService } from './prometheus.service';

@Injectable()
export class ClustersService {
  constructor(
    @InjectRepository(Cluster) private readonly repo: Repository<Cluster>,
    private readonly crypto: CryptoService,
    private readonly prom: PrometheusService,
  ) {}

  list(workspaceId?: string) {
    const where = workspaceId ? ([{ workspaceId }, { workspaceId: IsNull() }] as any) : undefined;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async get(id: string, workspaceId?: string) {
    const where: any = workspaceId ? [{ id, workspaceId }, { id, workspaceId: IsNull() }] : { id };
    const c = await this.repo.findOne({ where });
    if (!c) throw new NotFoundException('Cluster not found');
    return c;
  }

  async create(dto: CreateClusterDto, workspaceId: string) {
    const c = this.repo.create({
      workspaceId,
      name: dto.name,
      prometheusUrl: dto.prometheusUrl,
      enabled: dto.enabled ?? true,
      bearerTokenEnc: dto.bearerToken ? this.crypto.encrypt(dto.bearerToken) : null,
    });
    return this.repo.save(c);
  }

  async update(id: string, dto: UpdateClusterDto, workspaceId?: string) {
    const c = await this.get(id, workspaceId);
    if (dto.name !== undefined) c.name = dto.name;
    if (dto.prometheusUrl !== undefined) c.prometheusUrl = dto.prometheusUrl;
    if (dto.enabled !== undefined) c.enabled = dto.enabled;
    if (dto.bearerToken !== undefined) {
      c.bearerTokenEnc = dto.bearerToken ? this.crypto.encrypt(dto.bearerToken) : null;
    }
    return this.repo.save(c);
  }

  async remove(id: string, workspaceId?: string) {
    const c = await this.get(id, workspaceId);
    await this.repo.remove(c);
    return { ok: true };
  }

  async testConnection(id: string, workspaceId?: string) {
    const c = await this.get(id, workspaceId);
    if (!c.enabled) throw new BadRequestException('Cluster is disabled');
    const token = this.crypto.decrypt(c.bearerTokenEnc);
    const value = await this.prom.queryScalarSum(c.prometheusUrl, 'sum(up)', token);
    return { ok: value !== null, value };
  }

  async listJobs(id: string, workspaceId?: string) {
    const c = await this.get(id, workspaceId);
    if (!c.enabled) throw new BadRequestException('Cluster is disabled');
    const token = this.crypto.decrypt(c.bearerTokenEnc);
    const values = await this.prom.labelValues(c.prometheusUrl, 'job', token);
    const jobs = (values ?? []).sort();
    return { ok: values !== null, jobs, count: jobs.length };
  }

  async jobHints(id: string, workspaceId?: string) {
    const c = await this.get(id, workspaceId);
    if (!c.enabled) throw new BadRequestException('Cluster is disabled');
    const token = this.crypto.decrypt(c.bearerTokenEnc);

    const all = (await this.prom.labelValues(c.prometheusUrl, 'job', token)) ?? [];

    const upVec = (await this.prom.queryVector(c.prometheusUrl, 'sum by (job) (up)', token)) ?? [];
    const upJobs = new Set<string>();
    const downJobs = new Set<string>();
    for (const s of upVec) {
      const job = String(s?.metric?.job || '');
      const v = Number(s?.value?.[1]);
      if (!job) continue;
      if (Number.isFinite(v) && v > 0) upJobs.add(job);
      else downJobs.add(job);
    }

    const jvmVec =
      (await this.prom.queryVector(c.prometheusUrl, 'count by (job) (jvm_memory_used_bytes{area="heap"})', token)) ?? [];
    const jvmJobs = new Set<string>();
    for (const s of jvmVec) {
      const job = String(s?.metric?.job || '');
      const v = Number(s?.value?.[1]);
      if (job && Number.isFinite(v) && v > 0) jvmJobs.add(job);
    }

    const httpVec =
      (await this.prom.queryVector(c.prometheusUrl, 'count by (job) (http_server_requests_seconds_count)', token)) ?? [];
    const httpJobs = new Set<string>();
    for (const s of httpVec) {
      const job = String(s?.metric?.job || '');
      const v = Number(s?.value?.[1]);
      if (job && Number.isFinite(v) && v > 0) httpJobs.add(job);
    }

    const allJobs = Array.from(new Set(all)).sort();
    return {
      ok: true,
      allJobs,
      upJobs: Array.from(upJobs).sort(),
      downJobs: Array.from(downJobs).sort(),
      jvmJobs: Array.from(jvmJobs).sort(),
      httpJobs: Array.from(httpJobs).sort(),
    };
  }

  async resolveBearerToken(clusterId: string, workspaceId?: string): Promise<string | null> {
    const c = await this.get(clusterId, workspaceId);
    return this.crypto.decrypt(c.bearerTokenEnc);
  }
}
