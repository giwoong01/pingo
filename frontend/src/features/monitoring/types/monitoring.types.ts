export type MonitoringStatus = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface RuntimeSignals {
  cpuUsageCores: number | null;
  gcPauseAvgMs: number | null;
  dbConnectionsActive: number | null;
  http2xxRate: number | null;
  http4xxRate: number | null;
  http5xxRate: number | null;
}

export interface CurrentMetric {
  timestamp: string;
  value: number;
  status: MonitoringStatus;
  heapMaxBytes: number;
  heapUsagePercent: number;
  signals: RuntimeSignals;
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

export interface InstanceCurrentMetric {
  timestamp: string;
  status: 'UNKNOWN' | MonitoringStatus;
  scope?: {
    mode: 'aggregate' | 'instance';
    instance: string | null;
  };
  signals: InstanceSignals;
  queries: Record<string, string>;
}

export interface InstanceTimeseriesResponse {
  metric: string;
  scope: {
    mode: 'aggregate' | 'instance';
    instance: string | null;
  };
  query: string;
  range: {
    startSec: number;
    endSec: number;
    stepSec: number;
  };
  points: Array<{ t: number; v: number }>;
}

export interface HistoricalMetric {
  timestamp: string;
  value: number;
}

export interface HistoryResponse {
  metrics: HistoricalMetric[];
}

export interface AIAnalysisRequest {
  currentValue: number;
  threshold: number;
}

export interface AIAnalysisResponse {
  analysis: string;
  recommendations: string[];
  severity: string;
}
