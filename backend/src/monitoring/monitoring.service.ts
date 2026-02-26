import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MemoryMetric } from './entities/memory-metric.entity';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';

export interface RuntimeSignals {
  cpuUsageCores: number | null;
  gcPauseAvgMs: number | null;
  dbConnectionsActive: number | null;
  http2xxRate: number | null;
  http4xxRate: number | null;
  http5xxRate: number | null;
}

export interface InstanceSignals {
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  memoryUsagePercent: number | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  swapUsagePercent: number | null;
  load1: number | null;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly defaultFallbackMaxMemory = 2 * 1024 * 1024 * 1024;
  private readonly lastWarnAtByKey = new Map<string, number>();
  private readonly lastInstanceStatusByKey = new Map<string, 'UNKNOWN' | 'NORMAL' | 'WARNING' | 'CRITICAL'>();

  constructor(
    @InjectRepository(MemoryMetric) private repo: Repository<MemoryMetric>,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getCurrentMemory() {
    const prometheusUrl = this.normalizePrometheusQueryUrl(
      this.config.get<string>('PROMETHEUS_URL', 'http://localhost:9090/api/v1/query'),
    );
    const targetLabels = this.config.get<string>('PROMETHEUS_TARGET_LABELS', '').trim();
    const heapSelector = this.buildLabelSelector(['area="heap"'], targetLabels);
    const usedQuery = this.getNonEmptyConfig(
      'PROMETHEUS_HEAP_USED_QUERY',
      `sum(jvm_memory_used_bytes${heapSelector})`,
    );
    const maxQuery = this.getNonEmptyConfig(
      'PROMETHEUS_HEAP_MAX_QUERY',
      `sum(jvm_memory_max_bytes${heapSelector} > 0)`,
    );
    const allowMockFallback = this.config.get<string>('MONITORING_ALLOW_RANDOM_FALLBACK', 'false') === 'true';

    let usedBytes = await this.queryPrometheusScalar(prometheusUrl, usedQuery);
    if (usedBytes === null && allowMockFallback) {
      usedBytes = Math.floor(Math.random() * 1024 * 1024 * 1024);
      this.logger.warn('Prometheus query failed. MONITORING_ALLOW_RANDOM_FALLBACK=true, using random mock value.');
    }

    if (usedBytes === null) {
      const latest = await this.repo.find({
        order: { timestamp: 'DESC' },
        take: 1,
      });
      const latestMetric = latest[0];
      if (!latestMetric) {
        this.warnThrottled(
          'prometheus.no_cache',
          `Unable to fetch current heap usage from Prometheus and no cached metric exists; returning fallback. url=${prometheusUrl} query=${usedQuery} targetLabels="${targetLabels || '(none)'}"`,
        );
        const fallbackMaxBytes = this.config.get<number>('JVM_HEAP_MAX_FALLBACK_BYTES', this.defaultFallbackMaxMemory);
        return {
          timestamp: new Date().toISOString(),
          value: 0,
          status: 'UNKNOWN',
          heapMaxBytes: Math.floor(fallbackMaxBytes),
          heapUsagePercent: 0,
          signals: this.emptyRuntimeSignals(),
        };
      }
      this.warnThrottled(
        'prometheus.cached_fallback',
        `Unable to fetch current heap usage from Prometheus; falling back to cached metric. url=${prometheusUrl} query=${usedQuery} targetLabels="${targetLabels || '(none)'}"`,
      );
      const fallbackMaxBytes = this.config.get<number>('JVM_HEAP_MAX_FALLBACK_BYTES', this.defaultFallbackMaxMemory);
      const fallbackPercent = fallbackMaxBytes > 0 ? (Number(latestMetric.value) / fallbackMaxBytes) * 100 : 0;

      return {
        timestamp: latestMetric.timestamp.toISOString(),
        value: Number(latestMetric.value),
        status: latestMetric.status,
        heapMaxBytes: Math.floor(fallbackMaxBytes),
        heapUsagePercent: Number(fallbackPercent.toFixed(2)),
        signals: this.emptyRuntimeSignals(),
      };
    }

    const maxBytes =
      (await this.queryPrometheusScalar(prometheusUrl, maxQuery)) ||
      this.config.get<number>('JVM_HEAP_MAX_FALLBACK_BYTES', this.defaultFallbackMaxMemory);
    const thresholdWarn = this.config.get<number>('JVM_HEAP_WARN_RATIO', 0.8);
    const thresholdCrit = this.config.get<number>('JVM_HEAP_CRITICAL_RATIO', 0.95);

    let status = 'NORMAL';
    const ratio = maxBytes > 0 ? usedBytes / maxBytes : 0;

    if (ratio >= thresholdCrit) status = 'CRITICAL';
    else if (ratio >= thresholdWarn) status = 'WARNING';

    const runtimeSignals = await this.queryRuntimeSignals(prometheusUrl, targetLabels);
    const entity = this.repo.create({
      value: Math.floor(usedBytes),
      status: status,
    });
    const saved = await this.repo.save(entity);

    return {
      timestamp: saved.timestamp.toISOString(),
      value: Number(saved.value),
      status: saved.status,
      heapMaxBytes: Math.floor(maxBytes),
      heapUsagePercent: Number((ratio * 100).toFixed(2)),
      signals: runtimeSignals,
    };
  }

  async getCurrentInstanceMemory(instance?: string) {
    const prometheusUrl = this.normalizePrometheusQueryUrl(
      this.config.get<string>('PROMETHEUS_URL', 'http://localhost:9090/api/v1/query'),
    );
    const nodeLabels = this.getNonEmptyConfig('PROMETHEUS_NODE_LABELS', '').trim();
    const safeInstance = String(instance || '')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const scopedLabels = safeInstance ? `${nodeLabels}${nodeLabels ? ',' : ''}instance="${safeInstance}"` : nodeLabels;
    const nodeSelector = this.buildLabelSelector([], scopedLabels);

    const memUsedQuery = this.getNonEmptyConfig(
      'PROMETHEUS_NODE_MEM_USED_QUERY',
      `sum(node_memory_MemTotal_bytes${nodeSelector} - node_memory_MemAvailable_bytes${nodeSelector})`,
    );
    const memTotalQuery = this.getNonEmptyConfig(
      'PROMETHEUS_NODE_MEM_TOTAL_QUERY',
      `sum(node_memory_MemTotal_bytes${nodeSelector})`,
    );
    const memAvailQuery = this.getNonEmptyConfig(
      'PROMETHEUS_NODE_MEM_AVAILABLE_QUERY',
      `sum(node_memory_MemAvailable_bytes${nodeSelector})`,
    );
    const swapUsedQuery = this.getNonEmptyConfig(
      'PROMETHEUS_NODE_SWAP_USED_QUERY',
      `sum(node_memory_SwapTotal_bytes${nodeSelector} - node_memory_SwapFree_bytes${nodeSelector})`,
    );
    const swapTotalQuery = this.getNonEmptyConfig(
      'PROMETHEUS_NODE_SWAP_TOTAL_QUERY',
      `sum(node_memory_SwapTotal_bytes${nodeSelector})`,
    );
    const load1Query = this.getNonEmptyConfig('PROMETHEUS_NODE_LOAD1_QUERY', `avg(node_load1${nodeSelector})`);

    const [memoryUsedBytes, memoryTotalBytes, memoryAvailableBytes, swapUsedBytes, swapTotalBytes, load1] = await Promise.all([
      this.queryPrometheusScalar(prometheusUrl, memUsedQuery),
      this.queryPrometheusScalar(prometheusUrl, memTotalQuery),
      this.queryPrometheusScalar(prometheusUrl, memAvailQuery),
      this.queryPrometheusScalar(prometheusUrl, swapUsedQuery),
      this.queryPrometheusScalar(prometheusUrl, swapTotalQuery),
      this.queryPrometheusScalar(prometheusUrl, load1Query),
    ]);

    const memUsagePercent =
      memoryUsedBytes !== null && memoryTotalBytes !== null && memoryTotalBytes > 0
        ? (memoryUsedBytes / memoryTotalBytes) * 100
        : null;
    const swapUsagePercent =
      swapUsedBytes !== null && swapTotalBytes !== null && swapTotalBytes > 0
        ? (swapUsedBytes / swapTotalBytes) * 100
        : null;

    const warnRatio = this.config.get<number>('INSTANCE_MEMORY_WARN_RATIO', 0.85);
    const critRatio = this.config.get<number>('INSTANCE_MEMORY_CRITICAL_RATIO', 0.95);
    const warnClearRatio = this.config.get<number>('INSTANCE_MEMORY_WARN_CLEAR_RATIO', Math.max(0, warnRatio - 0.02));
    const critClearRatio = this.config.get<number>('INSTANCE_MEMORY_CRITICAL_CLEAR_RATIO', Math.max(0, critRatio - 0.02));
    const memRatio = memUsagePercent !== null ? memUsagePercent / 100 : null;
    const statusKey = safeInstance || '__aggregate__';
    const status = this.resolveInstanceStatusWithHysteresis(
      statusKey,
      memRatio,
      warnRatio,
      critRatio,
      warnClearRatio,
      critClearRatio,
    );

    const signals: InstanceSignals = {
      memoryUsedBytes: this.roundValue(memoryUsedBytes, 0),
      memoryTotalBytes: this.roundValue(memoryTotalBytes, 0),
      memoryAvailableBytes: this.roundValue(memoryAvailableBytes, 0),
      memoryUsagePercent: this.roundValue(memUsagePercent, 2),
      swapUsedBytes: this.roundValue(swapUsedBytes, 0),
      swapTotalBytes: this.roundValue(swapTotalBytes, 0),
      swapUsagePercent: this.roundValue(swapUsagePercent, 2),
      load1: this.roundValue(load1, 2),
    };

    return {
      timestamp: new Date().toISOString(),
      status,
      signals,
      thresholds: {
        memoryWarnRatio: this.roundValue(warnRatio * 100, 2),
        memoryCriticalRatio: this.roundValue(critRatio * 100, 2),
        memoryWarnClearRatio: this.roundValue(warnClearRatio * 100, 2),
        memoryCriticalClearRatio: this.roundValue(critClearRatio * 100, 2),
      },
      scope: { mode: safeInstance ? 'instance' : 'aggregate', instance: safeInstance || null },
      queries: {
        memoryUsed: memUsedQuery,
        memoryTotal: memTotalQuery,
        memoryAvailable: memAvailQuery,
        swapUsed: swapUsedQuery,
        swapTotal: swapTotalQuery,
        load1: load1Query,
      },
    };
  }

  async getInstanceTimeseries(instance: string | undefined, metric: string, minutes = 60, stepSec = 30) {
    const prometheusUrl = this.normalizePrometheusQueryUrl(
      this.config.get<string>('PROMETHEUS_URL', 'http://localhost:9090/api/v1/query'),
    );
    const nodeLabels = this.getNonEmptyConfig('PROMETHEUS_NODE_LABELS', '').trim();
    const safeInstance = String(instance || '')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    const scopedLabels = safeInstance ? `${nodeLabels}${nodeLabels ? ',' : ''}instance="${safeInstance}"` : nodeLabels;
    const nodeSelector = this.buildLabelSelector([], scopedLabels);

    const templates: Record<string, string> = {
      memory_usage_percent: `100 * (sum(node_memory_MemTotal_bytes${nodeSelector} - node_memory_MemAvailable_bytes${nodeSelector}) / clamp_min(sum(node_memory_MemTotal_bytes${nodeSelector}), 1))`,
      swap_usage_percent: `100 * (sum(node_memory_SwapTotal_bytes${nodeSelector} - node_memory_SwapFree_bytes${nodeSelector}) / clamp_min(sum(node_memory_SwapTotal_bytes${nodeSelector}), 1))`,
      load1: `avg(node_load1${nodeSelector})`,
      memory_used_bytes: `sum(node_memory_MemTotal_bytes${nodeSelector} - node_memory_MemAvailable_bytes${nodeSelector})`,
      memory_total_bytes: `sum(node_memory_MemTotal_bytes${nodeSelector})`,
      memory_available_bytes: `sum(node_memory_MemAvailable_bytes${nodeSelector})`,
      swap_used_bytes: `sum(node_memory_SwapTotal_bytes${nodeSelector} - node_memory_SwapFree_bytes${nodeSelector})`,
      swap_total_bytes: `sum(node_memory_SwapTotal_bytes${nodeSelector})`,
      load5: `avg(node_load5${nodeSelector})`,
      load15: `avg(node_load15${nodeSelector})`,
      memory_cached_bytes: `sum(node_memory_Cached_bytes${nodeSelector})`,
      memory_buffers_bytes: `sum(node_memory_Buffers_bytes${nodeSelector})`,
    };

    if (!templates[metric]) {
      throw new BadRequestException('Unknown metric');
    }

    const query = templates[metric];
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - Math.max(1, minutes) * 60;
    const step = Math.max(5, stepSec);
    const points = await this.queryPrometheusRangeSeries(prometheusUrl, query, startSec, endSec, step);

    return {
      scope: { mode: safeInstance ? 'instance' : 'aggregate', instance: safeInstance || null },
      range: { startSec, endSec, stepSec: step },
      points: points ?? [],
    };
  }

  async getHistory(limit: number, duration: string) {
    const now = new Date();
    const since = new Date(now.getTime() - this.parseDurationMs(duration));
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 50;

    const metrics = await this.repo.find({
      where: { timestamp: MoreThanOrEqual(since) },
      order: { timestamp: 'DESC' },
      take: safeLimit,
    });

    return {
      metrics: metrics.map(m => ({
        timestamp: m.timestamp.toISOString(),
        value: Number(m.value),
      })),
    };
  }

  async analyzeMemory(dto: AnalyzeRequestDto) {
    if (!Number.isFinite(dto.threshold) || dto.threshold <= 0) {
      throw new BadRequestException('Threshold must be a positive number.');
    }

    const usagePercent = (dto.currentValue / dto.threshold) * 100;
    
    let analysis = 'Memory usage is within safe limits.';
    let recommendations = ['No immediate action required.', 'Continue monitoring baseline trends.'];
    let severity = 'LOW';

    if (usagePercent > 95) {
      severity = 'CRITICAL';
      analysis = `JVM Heap usage is at ${usagePercent.toFixed(1)}%, which is dangerously close to or exceeding the threshold. This likely indicates a memory leak or insufficient heap allocation.`;
      recommendations = [
        'Trigger a manual Garbage Collection for diagnostic purposes.',
        'Generate and analyze a Heap Dump to identify leaking objects.',
        'Increase -Xmx values if workload has legitimately grown.',
        'Check for long-lived objects in static collections.'
      ];
    } else if (usagePercent > 80) {
      severity = 'MEDIUM';
      analysis = `Usage is elevated at ${usagePercent.toFixed(1)}%. Performance may start to degrade due to frequent GC cycles.`;
      recommendations = [
        'Review recently deployed code for memory-intensive operations.',
        'Monitor GC frequency and pause times.',
        'Scale up the instance if traffic has increased.'
      ];
    }

    return {
    };
  }

  private async queryPrometheusScalar(prometheusUrl: string, query: string): Promise<number | null> {
    try {
      const response = await firstValueFrom(this.httpService.get(prometheusUrl, { params: { query } }));
      const payload = response.data;
      if (payload?.status && payload.status !== 'success') {
        const errorType = payload?.errorType;
        const errorMessage = payload?.error;
        this.warnThrottled(
          `prometheus.error_status.${errorType || 'unknown'}`,
          `Prometheus returned error status. url=${prometheusUrl} query=${query} errorType=${errorType || '-'} error=${errorMessage || '-'}`,
        );
        return null;
      }

      const result = payload?.data?.result;
      if (!Array.isArray(result) || result.length === 0) {
        return null;
      }

      let total = 0;
      let seen = 0;

      for (const series of result) {
        const rawValue = series?.value?.[1];
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue)) {
          total += numericValue;
          seen += 1;
        }
      }

      if (seen === 0) {
        return null;
      }
      return total;
    } catch (error) {
      const anyError = error as any;
      const status = anyError?.response?.status;
      const errorType = anyError?.response?.data?.errorType;
      const errorMessage = anyError?.response?.data?.error;
      const code = anyError?.code;
      const message = anyError?.message;

      this.warnThrottled(
        `prometheus.request_failed.${status ?? code ?? 'unknown'}`,
        `Prometheus request failed. url=${prometheusUrl} query=${query} status=${status ?? '-'} code=${code ?? '-'} errorType=${errorType || '-'} error=${errorMessage || '-'} message=${message || '-'}`,
      );
      return null;
    }
  }

  private async queryPrometheusRangeSeries(
    prometheusUrl: string,
    query: string,
    startSec: number,
    endSec: number,
    stepSec: number,
  ): Promise<Array<{ t: number; v: number }> | null> {
    try {
      const rangeUrl = this.normalizePrometheusQueryRangeUrl(prometheusUrl);
      const response = await firstValueFrom(
        this.httpService.get(rangeUrl, {
          params: { query, start: startSec, end: endSec, step: stepSec },
        }),
      );
      const payload = response.data;
      if (payload?.status && payload.status !== 'success') {
        return null;
      }
      const matrix = payload?.data?.result;
      if (!Array.isArray(matrix) || matrix.length === 0) {
        return null;
      }

      const byTs = new Map<number, number>();
      for (const series of matrix) {
        const values = series?.values;
        if (!Array.isArray(values)) continue;
        for (const point of values) {
          const ts = Number(point?.[0]);
          const v = Number(point?.[1]);
          if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
          byTs.set(ts, (byTs.get(ts) ?? 0) + v);
        }
      }
      const out = Array.from(byTs.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([t, v]) => ({ t, v: Number(v.toFixed(4)) }));
      return out.length ? out : null;
    } catch {
      return null;
    }
  }

  private async queryRuntimeSignals(prometheusUrl: string, targetLabels: string): Promise<RuntimeSignals> {
    const processLabels = this.getNonEmptyConfig('PROMETHEUS_PROCESS_LABELS', targetLabels);
    const gcLabels = this.getNonEmptyConfig('PROMETHEUS_GC_LABELS', targetLabels);
    const dbLabels = this.getNonEmptyConfig('PROMETHEUS_DB_LABELS', targetLabels);
    const httpLabels = this.getNonEmptyConfig('PROMETHEUS_HTTP_LABELS', targetLabels);

    const processSelector = this.buildLabelSelector([], processLabels);
    const gcSelector = this.buildLabelSelector([], gcLabels);
    const dbSelector = this.buildLabelSelector([], dbLabels);
    const httpSelector = this.buildLabelSelector([], httpLabels);
    const http2xxSelector = this.buildLabelSelector(['status=~"2.."'], httpLabels);
    const http4xxSelector = this.buildLabelSelector(['status=~"4.."'], httpLabels);
    const http5xxSelector = this.buildLabelSelector(['status=~"5.."'], httpLabels);
    const httpMetric = this.config.get<string>('PROMETHEUS_HTTP_METRIC', 'http_server_requests_seconds_count');

    const cpuQuery = this.getNonEmptyConfig(
      'PROMETHEUS_CPU_QUERY',
      `sum(rate(process_cpu_seconds_total${processSelector}[1m]))`,
    );
    const gcPauseAvgMsQuery = this.getNonEmptyConfig(
      'PROMETHEUS_GC_PAUSE_AVG_MS_QUERY',
      `1000 * (sum(rate(jvm_gc_pause_seconds_sum${gcSelector}[5m])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count${gcSelector}[5m])), 1))`,
    );
    const dbConnectionsQuery = this.getNonEmptyConfig(
      'PROMETHEUS_DB_ACTIVE_CONNECTIONS_QUERY',
      `sum(hikaricp_connections_active${dbSelector})`,
    );
    const http2xxRateQuery = this.getNonEmptyConfig(
      'PROMETHEUS_HTTP_2XX_RATE_QUERY',
      `100 * (sum(rate(${httpMetric}${http2xxSelector}[1m])) / clamp_min(sum(rate(${httpMetric}${httpSelector}[1m])), 1))`,
    );
    const http4xxRateQuery = this.getNonEmptyConfig(
      'PROMETHEUS_HTTP_4XX_RATE_QUERY',
      `100 * (sum(rate(${httpMetric}${http4xxSelector}[1m])) / clamp_min(sum(rate(${httpMetric}${httpSelector}[1m])), 1))`,
    );
    const http5xxRateQuery = this.getNonEmptyConfig(
      'PROMETHEUS_HTTP_5XX_RATE_QUERY',
      `100 * (sum(rate(${httpMetric}${http5xxSelector}[1m])) / clamp_min(sum(rate(${httpMetric}${httpSelector}[1m])), 1))`,
    );

    const [cpuUsageCores, gcPauseAvgMs, dbConnectionsActive, http2xxRate, http4xxRate, http5xxRate] =
      await Promise.all([
        this.queryPrometheusScalar(prometheusUrl, cpuQuery),
        this.queryPrometheusScalar(prometheusUrl, gcPauseAvgMsQuery),
        this.queryPrometheusScalar(prometheusUrl, dbConnectionsQuery),
        this.queryPrometheusScalar(prometheusUrl, http2xxRateQuery),
        this.queryPrometheusScalar(prometheusUrl, http4xxRateQuery),
        this.queryPrometheusScalar(prometheusUrl, http5xxRateQuery),
      ]);

    return {
      cpuUsageCores: this.roundValue(cpuUsageCores, 4),
      gcPauseAvgMs: this.roundValue(gcPauseAvgMs, 2),
      dbConnectionsActive: this.roundValue(dbConnectionsActive, 2),
      http2xxRate: this.roundValue(http2xxRate, 2),
      http4xxRate: this.roundValue(http4xxRate, 2),
      http5xxRate: this.roundValue(http5xxRate, 2),
    };
  }

  private emptyRuntimeSignals(): RuntimeSignals {
    return {
      cpuUsageCores: null,
      gcPauseAvgMs: null,
      dbConnectionsActive: null,
      http2xxRate: null,
      http4xxRate: null,
      http5xxRate: null,
    };
  }

  private roundValue(value: number | null, digits: number): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }
    return Number(value.toFixed(digits));
  }

  private resolveInstanceStatusWithHysteresis(
    key: string,
    memRatio: number | null,
    warnEnter: number,
    critEnter: number,
    warnClear: number,
    critClear: number,
  ): 'UNKNOWN' | 'NORMAL' | 'WARNING' | 'CRITICAL' {
    if (memRatio === null) {
      this.lastInstanceStatusByKey.set(key, 'UNKNOWN');
      return 'UNKNOWN';
    }

    const prev = this.lastInstanceStatusByKey.get(key);
    let next: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';

    if (prev === 'CRITICAL') {
      if (memRatio >= critClear) next = 'CRITICAL';
      else if (memRatio >= warnEnter) next = 'WARNING';
      else next = 'NORMAL';
    } else if (prev === 'WARNING') {
      if (memRatio >= critEnter) next = 'CRITICAL';
      else if (memRatio >= warnClear) next = 'WARNING';
      else next = 'NORMAL';
    } else {
      if (memRatio >= critEnter) next = 'CRITICAL';
      else if (memRatio >= warnEnter) next = 'WARNING';
      else next = 'NORMAL';
    }

    this.lastInstanceStatusByKey.set(key, next);
    return next;
  }

  private getNonEmptyConfig(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) {
      return fallback;
    }
    const trimmed = String(raw).trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private warnThrottled(key: string, message: string, intervalMs = 5 * 60 * 1000): void {
    const now = Date.now();
    const last = this.lastWarnAtByKey.get(key) ?? 0;
    if (now - last < intervalMs) {
      return;
    }
    this.lastWarnAtByKey.set(key, now);
    this.logger.warn(message);
  }

  private buildLabelSelector(requiredLabels: string[], extraLabelsRaw: string): string {
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const label of requiredLabels) {
      const normalized = label.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }

    const extraLabels = extraLabelsRaw
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    for (const label of extraLabels) {
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      merged.push(label);
    }

    if (merged.length === 0) {
      return '';
    }
    return `{${merged.join(',')}}`;
  }

  private normalizePrometheusQueryUrl(rawUrl: string): string {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return 'http://localhost:9090/api/v1/query';
    }
    if (trimmed.includes('/api/v1/query')) {
      return trimmed;
    }
    return trimmed.replace(/\/$/, '') + '/api/v1/query';
  }

  private normalizePrometheusQueryRangeUrl(rawUrl: string): string {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return 'http://localhost:9090/api/v1/query_range';
    }
    if (trimmed.includes('/api/v1/query_range')) {
      return trimmed;
    }
    if (trimmed.includes('/api/v1/query')) {
      return trimmed.replace('/api/v1/query', '/api/v1/query_range');
    }
    return trimmed.replace(/\/$/, '') + '/api/v1/query_range';
  }

  private parseDurationMs(duration: string): number {
    const defaultMs = 60 * 60 * 1000;
    if (!duration || typeof duration !== 'string') {
      return defaultMs;
    }

    const trimmed = duration.trim();
    const matched = /^(\d+)([hd])$/i.exec(trimmed);
    if (!matched) {
      return defaultMs;
    }

    const amount = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return defaultMs;
    }

    if (unit === 'h') {
      return amount * 60 * 60 * 1000;
    }
    return amount * 24 * 60 * 60 * 1000;
  }
}
