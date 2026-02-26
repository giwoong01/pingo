import { Injectable } from '@nestjs/common';
import type { RuleKind } from '../entities/rule.entity';

export interface RulePreset {
  id: string;
  kind: RuleKind;
  name: string;
  description: string;
  exprTemplate: string;
  defaultThreshold?: string;
  defaultForSeconds: number;
  defaultIntervalSeconds: number;
  defaultCooldownSeconds: number;
}

@Injectable()
export class PresetsService {
  private readonly presets: RulePreset[] = [
    {
      id: 'instance_down',
      kind: 'INSTANCE_DOWN',
      name: 'Instance Down',
      description: 'Any target for this job is down.',
      exprTemplate: 'min(up{job="${job}"${instanceMatcher}}) == 0',
      defaultForSeconds: 60,
      defaultIntervalSeconds: 30,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'heap_ratio_high',
      kind: 'HEAP_RATIO_HIGH',
      name: 'JVM Heap Usage Ratio High',
      description: 'Heap used/max ratio above threshold.',
      exprTemplate:
        'sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"}) / clamp_min(sum(jvm_memory_max_bytes{job="${job}"${instanceMatcher},area="heap"} > 0), 1) > ${threshold}',
      defaultThreshold: '0.8',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'gc_pause_avg_high',
      kind: 'GC_PAUSE_AVG_HIGH',
      name: 'GC Pause Avg High (ms)',
      description: 'Average GC pause time (ms) above threshold.',
      exprTemplate:
        '1000 * (sum(rate(jvm_gc_pause_seconds_sum{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)) > ${threshold}',
      defaultThreshold: '200',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'cpu_cores_high',
      kind: 'CPU_CORES_HIGH',
      name: 'Process CPU Cores High',
      description: 'CPU core usage above threshold (cores).',
      exprTemplate:
        '((sum(rate(process_cpu_seconds_total{job="${job}"${instanceMatcher}}[1m]))) or (sum(rate(process_cpu_time_ns_total{job="${job}"${instanceMatcher}}[1m])) / 1e9) or (sum(process_cpu_usage{job="${job}"${instanceMatcher}}))) > ${threshold}',
      defaultThreshold: '1.5',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 30,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'rss_bytes_high',
      kind: 'RSS_BYTES_HIGH',
      name: 'Process RSS Memory High (bytes)',
      description: 'Resident memory above threshold.',
      exprTemplate: 'max(process_resident_memory_bytes{job="${job}"${instanceMatcher}}) > ${threshold}',
      defaultThreshold: String(2 * 1024 * 1024 * 1024),
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'http_5xx_ratio_high',
      kind: 'HTTP_5XX_RATIO_HIGH',
      name: 'HTTP 5xx Ratio High',
      description: '5xx ratio above threshold.',
      exprTemplate:
        'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1) > ${threshold}',
      defaultThreshold: '0.02',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'http_4xx_ratio_high',
      kind: 'CUSTOM',
      name: 'HTTP 4xx Ratio High',
      description: '4xx ratio above threshold.',
      exprTemplate:
        'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"4.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1) > ${threshold}',
      defaultThreshold: '0.1',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'http_latency_p95_high',
      kind: 'HTTP_LATENCY_P95_HIGH',
      name: 'HTTP Latency p95 High (s)',
      description: 'p95 latency above threshold (seconds).',
      exprTemplate:
        '((histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m])))) > ${threshold}',
      defaultThreshold: '0.5',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'http_latency_p99_high',
      kind: 'CUSTOM',
      name: 'HTTP Latency p99 High (s)',
      description: 'p99 latency above threshold (seconds).',
      exprTemplate:
        '((histogram_quantile(0.99, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m])))) > ${threshold}',
      defaultThreshold: '1.0',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'http_rps_drop',
      kind: 'HTTP_RPS_DROP',
      name: 'HTTP RPS Drop (relative)',
      description: 'RPS dropped relative to 30m ago.',
      exprTemplate:
        '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m] offset 30m)), 0.0001)) < ${threshold}',
      defaultThreshold: '0.5',
      defaultForSeconds: 600,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 900,
    },
    {
      id: 'instance_memory_usage_high',
      kind: 'CUSTOM',
      name: 'Instance Memory Usage High (%)',
      description: 'Instance memory usage percent above threshold (node_exporter).',
      exprTemplate:
        '100 * (sum(node_memory_MemTotal_bytes{${instanceMatcherOnly}} - node_memory_MemAvailable_bytes{${instanceMatcherOnly}}) / clamp_min(sum(node_memory_MemTotal_bytes{${instanceMatcherOnly}}), 1)) > ${threshold}',
      defaultThreshold: '85',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'instance_load1_high',
      kind: 'CUSTOM',
      name: 'Instance Load1 High',
      description: 'Instance load1 above threshold (node_exporter).',
      exprTemplate: 'avg(node_load1{${instanceMatcherOnly}}) > ${threshold}',
      defaultThreshold: '2',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'instance_swap_usage_high',
      kind: 'CUSTOM',
      name: 'Instance Swap Usage High (%)',
      description: 'Instance swap usage percent above threshold (node_exporter).',
      exprTemplate:
        '100 * (sum(node_memory_SwapTotal_bytes{${instanceMatcherOnly}} - node_memory_SwapFree_bytes{${instanceMatcherOnly}}) / clamp_min(sum(node_memory_SwapTotal_bytes{${instanceMatcherOnly}}), 1)) > ${threshold}',
      defaultThreshold: '20',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'slo_burn_rate_fast_5m',
      kind: 'SLO_BURN_RATE_HIGH',
      name: 'SLO Burn Rate Fast (5m, 99.9% SLO)',
      description: 'Error-budget burn rate over 5m window. burn_rate = error_ratio_5m / 0.001 (99.9% SLO).',
      exprTemplate:
        '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)) / 0.001 > ${threshold}',
      defaultThreshold: '14.4',
      defaultForSeconds: 120,
      defaultIntervalSeconds: 30,
      defaultCooldownSeconds: 600,
    },
    {
      id: 'slo_burn_rate_slow_30m',
      kind: 'SLO_BURN_RATE_HIGH',
      name: 'SLO Burn Rate Slow (30m, 99.9% SLO)',
      description: 'Error-budget burn rate over 30m window. burn_rate = error_ratio_30m / 0.001 (99.9% SLO).',
      exprTemplate:
        '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[30m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[30m])), 1)) / 0.001 > ${threshold}',
      defaultThreshold: '6',
      defaultForSeconds: 300,
      defaultIntervalSeconds: 60,
      defaultCooldownSeconds: 900,
    },
  ];

  list(): RulePreset[] {
    return this.presets;
  }

  getById(id: string): RulePreset | null {
    return this.presets.find((p) => p.id === id) ?? null;
  }
}
