import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { App } from '../entities/app.entity';
import { Cluster } from '../entities/cluster.entity';
import { ClustersService } from './clusters.service';
import { PrometheusService } from './prometheus.service';

@Injectable()
export class AppHealthService {
  constructor(
    @InjectRepository(App) private readonly appRepo: Repository<App>,
    @InjectRepository(Cluster) private readonly clusterRepo: Repository<Cluster>,
    private readonly clusters: ClustersService,
    private readonly prom: PrometheusService,
  ) {}

  private parseDurationSeconds(raw: string | null | undefined): number | null {
    const s = String(raw || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = m[2];
    if (unit === 'ms') return n / 1000;
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    if (unit === 'd') return n * 86400;
    return null;
  }

  private classifyTargetReason(health: string | null, lastError: string | null, lastScrapeAgeSec: number | null, scrapeIntervalSec: number | null) {
    const h = String(health || '').toLowerCase();
    const err = String(lastError || '');
    if (h && h !== 'up') {
      const e = err.toLowerCase();
      if (!e) return 'down';
      if (e.includes('context deadline exceeded') || e.includes('i/o timeout') || e.includes('client.timeout') || e.includes('timeout'))
        return 'timeout';
      if (e.includes('lookup ') || e.includes('no such host') || e.includes('server misbehaving')) return 'dns';
      if (e.includes('connection refused')) return 'conn_refused';
      if (e.includes('no route to host') || e.includes('network is unreachable')) return 'network';
      if (e.includes('401') || e.includes('403') || e.includes('unauthorized') || e.includes('forbidden')) return 'auth';
      return 'error';
    }
    if (lastScrapeAgeSec !== null && scrapeIntervalSec !== null && lastScrapeAgeSec > Math.max(60, scrapeIntervalSec * 4)) {
      return 'stale';
    }
    return null;
  }

  async listHealth(workspaceId?: string) {
    const apps = await this.appRepo.find({
      where: workspaceId ? ({ workspaceId } as any) : undefined,
      order: { createdAt: 'DESC' },
    });
    const byCluster = new Map<string, App[]>();
    for (const app of apps) {
      const arr = byCluster.get(app.clusterId) ?? [];
      arr.push(app);
      byCluster.set(app.clusterId, arr);
    }

    const results: any[] = [];
    for (const [clusterId, clusterApps] of byCluster.entries()) {
      const cluster = await this.clusterRepo.findOne({ where: { id: clusterId, workspaceId } as any });
      if (!cluster) continue;
      const token = await this.clusters.resolveBearerToken(clusterId, workspaceId);

      const upVec = (await this.prom.queryVector(cluster.prometheusUrl, 'sum by (job) (up)', token)) ?? [];
      const countVec = (await this.prom.queryVector(cluster.prometheusUrl, 'count by (job) (up)', token)) ?? [];
      const targets = (await this.prom.targets(cluster.prometheusUrl, token)) ?? [];

      const upByJob = new Map<string, number>();
      for (const s of upVec) {
        const job = String(s?.metric?.job || '');
        const v = Number(s?.value?.[1]);
        if (!job || !Number.isFinite(v)) continue;
        upByJob.set(job, v);
      }

      const countByJob = new Map<string, number>();
      for (const s of countVec) {
        const job = String(s?.metric?.job || '');
        const v = Number(s?.value?.[1]);
        if (!job || !Number.isFinite(v)) continue;
        countByJob.set(job, v);
      }

      const targetByJob = new Map<string,
        {
          health: string | null;
          lastError: string | null;
          lastScrape: string | null;
          lastScrapeAgeSec: number | null;
          scrapeUrl: string | null;
          scrapeIntervalSec: number | null;
          scrapeTimeoutSec: number | null;
          instance: string | null;
          upCount: number;
          downCount: number;
          reason: string | null;
        }
      >();

      const nowMs = Date.now();
      const byJob = new Map<string, any[]>();
      for (const t of targets) {
        const job = String((t as any)?.labels?.job || '');
        if (!job) continue;
        const arr = byJob.get(job) ?? [];
        arr.push(t);
        byJob.set(job, arr);
      }
      for (const [job, arr] of byJob.entries()) {
        const upArr = arr.filter((t) => String((t as any)?.health || '').toLowerCase() === 'up');
        const downArr = arr.filter((t) => String((t as any)?.health || '').toLowerCase() !== 'up');
        const picked = (downArr.find((t) => (t as any)?.lastError) || downArr[0] || upArr[0] || arr[0]) as any;
        const health = picked?.health ? String(picked.health) : null;
        const lastError = picked?.lastError ? String(picked.lastError) : null;
        const lastScrape = picked?.lastScrape ? String(picked.lastScrape) : null;
        const scrapeUrl = picked?.scrapeUrl ? String(picked.scrapeUrl) : null;
        const instance = picked?.labels?.instance ? String(picked.labels.instance) : null;
        const scrapeIntervalSec = this.parseDurationSeconds(picked?.scrapeInterval);
        const scrapeTimeoutSec = this.parseDurationSeconds(picked?.scrapeTimeout);
        const lastScrapeMs = lastScrape ? Date.parse(lastScrape) : NaN;
        const lastScrapeAgeSec = Number.isFinite(lastScrapeMs) ? Math.max(0, Math.floor((nowMs - lastScrapeMs) / 1000)) : null;
        const reason = this.classifyTargetReason(health, lastError, lastScrapeAgeSec, scrapeIntervalSec);
        targetByJob.set(job, {
          health,
          lastError,
          lastScrape,
          lastScrapeAgeSec,
          scrapeUrl,
          scrapeIntervalSec,
          scrapeTimeoutSec,
          instance,
          upCount: upArr.length,
          downCount: downArr.length,
          reason,
        });
      }

      for (const app of clusterApps) {
        const upSum = upByJob.get(app.job);
        const seriesCount = countByJob.get(app.job);
        const ok = typeof upSum === 'number' ? upSum > 0 : false;
        const t = targetByJob.get(app.job) ?? null;
        const targetUpCount = t?.upCount ?? null;
        const targetDownCount = t?.downCount ?? null;
        const hasKnownSeries = typeof seriesCount === 'number' && seriesCount > 0;
        const isDown = hasKnownSeries && typeof upSum === 'number' && upSum <= 0;
        const hasPartialDownFromCounts =
          hasKnownSeries && typeof upSum === 'number' && upSum > 0 && typeof seriesCount === 'number' && seriesCount > upSum;
        const hasPartialDownFromTargets =
          typeof targetUpCount === 'number' && typeof targetDownCount === 'number' && targetUpCount > 0 && targetDownCount > 0;
        const degraded = !isDown && (hasPartialDownFromCounts || hasPartialDownFromTargets);
        const healthStatus = !hasKnownSeries ? 'UNKNOWN' : isDown ? 'DOWN' : degraded ? 'DEGRADED' : 'OK';
        results.push({
          appId: app.id,
          job: app.job,
          upSum: upSum ?? null,
          seriesCount: seriesCount ?? null,
          targetHealth: t?.health ?? null,
          targetReason: t?.reason ?? null,
          lastScrape: t?.lastScrape ?? null,
          lastScrapeAgeSec: t?.lastScrapeAgeSec ?? null,
          lastError: t?.lastError ?? null,
          scrapeUrl: t?.scrapeUrl ?? null,
          scrapeIntervalSec: t?.scrapeIntervalSec ?? null,
          scrapeTimeoutSec: t?.scrapeTimeoutSec ?? null,
          instance: t?.instance ?? null,
        });
      }
    }

    return results;
  }
}
