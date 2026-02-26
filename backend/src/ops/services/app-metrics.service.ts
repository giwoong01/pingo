import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { App } from '../entities/app.entity';
import { Cluster } from '../entities/cluster.entity';
import { ClustersService } from './clusters.service';
import { PrometheusService } from './prometheus.service';

export type AppMetricKey =
  | 'up_sum'
  | 'cpu_cores'
  | 'rss_bytes'
  | 'rps'
  | 'http_5xx_ratio'
  | 'latency_p95_s'
  | 'heap_ratio'
  | 'gc_pause_avg_ms';

@Injectable()
export class AppMetricsService {
  constructor(
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    private readonly clusters: ClustersService,
    private readonly prom: PrometheusService,
  ) {}

  private templates: Record<AppMetricKey, string> = {
    up_sum: 'sum(up{job="${job}"${instanceMatcher}})',
    cpu_cores:
      '(sum(rate(process_cpu_seconds_total{job="${job}"${instanceMatcher}}[1m]))) or (sum(rate(process_cpu_time_ns_total{job="${job}"${instanceMatcher}}[1m])) / 1e9) or (sum(process_cpu_usage{job="${job}"${instanceMatcher}}))',
    rss_bytes: 'max(process_resident_memory_bytes{job="${job}"${instanceMatcher}})',
    rps: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m]))',
    http_5xx_ratio:
      'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)',
    latency_p95_s:
      '(histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m])))',
    heap_ratio:
      'sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"}) / clamp_min(sum(jvm_memory_max_bytes{job="${job}"${instanceMatcher},area="heap"} > 0), 1)',
    gc_pause_avg_ms:
      '1000 * (sum(rate(jvm_gc_pause_seconds_sum{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1))',
  };

  private interpolate(expr: string, job: string, instance?: string): string {
    const safeJob = String(job || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeInstance = String(instance || '')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const instanceMatcher = safeInstance ? `,instance="${safeInstance}"` : '';
    return String(expr || '').replace(/\$\{job\}/g, safeJob).replace(/\$\{instanceMatcher\}/g, instanceMatcher);
  }

  async getSummary(appId: string, workspaceId: string, instance?: string) {
    const app = await this.appRepo.findOne({ where: { id: appId, workspaceId } as any });
    if (!app) throw new BadRequestException('App not found');
    const cluster = await this.clusterRepo.findOne({ where: { id: app.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const token = await this.clusters.resolveBearerToken(app.clusterId, workspaceId);

    const metrics: Record<string, any> = {};
    for (const key of Object.keys(this.templates) as AppMetricKey[]) {
      const expr = this.interpolate(this.templates[key], app.job, instance);
      const v = await this.prom.queryScalarSum(cluster.prometheusUrl, expr, token);
      metrics[key] = { value: v, expr };
    }

    return {
      app: { id: app.id, name: app.name, job: app.job, clusterId: app.clusterId },
      scope: { mode: instance ? 'instance' : 'aggregate', instance: instance || null },
      metrics,
      at: new Date().toISOString(),
    };
  }

  async getTimeseries(appId: string, workspaceId: string, metric: AppMetricKey, minutes = 60, stepSec = 30, instance?: string) {
    const app = await this.appRepo.findOne({ where: { id: appId, workspaceId } as any });
    if (!app) throw new BadRequestException('App not found');
    const cluster = await this.clusterRepo.findOne({ where: { id: app.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const token = await this.clusters.resolveBearerToken(app.clusterId, workspaceId);

    const tpl = this.templates[metric];
    if (!tpl) throw new BadRequestException('Unknown metric');

    const expr = this.interpolate(tpl, app.job, instance);
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - Math.max(1, minutes) * 60;
    const step = Math.max(5, stepSec);
    const points = await this.prom.queryRangeScalarSum(cluster.prometheusUrl, expr, startSec, endSec, step, token);

    return {
      app: { id: app.id, name: app.name, job: app.job },
      scope: { mode: instance ? 'instance' : 'aggregate', instance: instance || null },
      metric,
      expr,
      range: { startSec, endSec, stepSec: step },
      points: points ?? [],
    };
  }

  async queryCustomScalar(appId: string, workspaceId: string, expr: string, instance?: string) {
    const app = await this.appRepo.findOne({ where: { id: appId, workspaceId } as any });
    if (!app) throw new BadRequestException('App not found');
    const cluster = await this.clusterRepo.findOne({ where: { id: app.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const query = String(expr || '').trim();
    if (!query) throw new BadRequestException('expr is required');
    if (query.length > 4000) throw new BadRequestException('expr is too long');
    const token = await this.clusters.resolveBearerToken(app.clusterId, workspaceId);
    const resolvedExpr = this.interpolate(query, app.job, instance);
    const value = await this.prom.queryScalarSum(cluster.prometheusUrl, resolvedExpr, token);
    return {
      app: { id: app.id, name: app.name, job: app.job, clusterId: app.clusterId },
      scope: { mode: instance ? 'instance' : 'aggregate', instance: instance || null },
      expr: resolvedExpr,
      value,
      at: new Date().toISOString(),
    };
  }

  async queryCustomTimeseries(appId: string, workspaceId: string, expr: string, minutes = 60, stepSec = 30, instance?: string) {
    const app = await this.appRepo.findOne({ where: { id: appId, workspaceId } as any });
    if (!app) throw new BadRequestException('App not found');
    const cluster = await this.clusterRepo.findOne({ where: { id: app.clusterId, workspaceId } as any });
    if (!cluster) throw new BadRequestException('Cluster not found');
    const query = String(expr || '').trim();
    if (!query) throw new BadRequestException('expr is required');
    if (query.length > 4000) throw new BadRequestException('expr is too long');
    const token = await this.clusters.resolveBearerToken(app.clusterId, workspaceId);
    const resolvedExpr = this.interpolate(query, app.job, instance);
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - Math.max(1, minutes) * 60;
    const step = Math.max(5, stepSec);
    const points = await this.prom.queryRangeScalarSum(cluster.prometheusUrl, resolvedExpr, startSec, endSec, step, token);
    return {
      app: { id: app.id, name: app.name, job: app.job, clusterId: app.clusterId },
      scope: { mode: instance ? 'instance' : 'aggregate', instance: instance || null },
      expr: resolvedExpr,
      range: { startSec, endSec, stepSec: step },
      points: points ?? [],
    };
  }
}
