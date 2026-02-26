import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type PromStatus = 'success' | 'error';

interface PromResponse {
  status: PromStatus;
  data?: {
    resultType?: string;
    result?: any[];
  };
  errorType?: string;
  error?: string;
}

export type ScalarQueryStatus = 'ok' | 'no_data' | 'error';
export type ScalarQueryResult = {
  status: ScalarQueryStatus;
  value: number | null;
};

export type PromTarget = {
  discoveredLabels?: Record<string, string>;
  labels?: Record<string, string>;
  scrapePool?: string;
  scrapeUrl?: string;
  globalUrl?: string;
  lastError?: string;
  lastScrape?: string;
  lastScrapeDuration?: number;
  health?: string;
  scrapeInterval?: string;
  scrapeTimeout?: string;
};

@Injectable()
export class PrometheusService {
  constructor(private readonly http: HttpService) {}

  normalizeQueryUrl(rawUrl: string): string {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return 'http://localhost:9090/api/v1/query';
    }
    if (trimmed.includes('/api/v1/query')) {
      return trimmed;
    }
    return trimmed.replace(/\/$/, '') + '/api/v1/query';
  }

  normalizeQueryRangeUrl(rawUrl: string): string {
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

  normalizeLabelValuesUrl(rawUrl: string, label: string): string {
    const trimmed = String(rawUrl || '').trim();
    const safeLabel = encodeURIComponent(String(label || '').trim());
    if (!trimmed) {
      return `http://localhost:9090/api/v1/label/${safeLabel}/values`;
    }
    if (trimmed.includes('/api/v1/label/')) {
      return trimmed;
    }
    if (trimmed.includes('/api/v1/query')) {
      return trimmed.replace('/api/v1/query', `/api/v1/label/${safeLabel}/values`);
    }
    if (trimmed.includes('/api/v1/query_range')) {
      return trimmed.replace('/api/v1/query_range', `/api/v1/label/${safeLabel}/values`);
    }
    return trimmed.replace(/\/$/, '') + `/api/v1/label/${safeLabel}/values`;
  }

  normalizeTargetsUrl(rawUrl: string): string {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return 'http://localhost:9090/api/v1/targets';
    }
    if (trimmed.includes('/api/v1/targets')) {
      return trimmed;
    }
    if (trimmed.includes('/api/v1/query_range')) {
      return trimmed.replace('/api/v1/query_range', '/api/v1/targets');
    }
    if (trimmed.includes('/api/v1/query')) {
      return trimmed.replace('/api/v1/query', '/api/v1/targets');
    }
    return trimmed.replace(/\/$/, '') + '/api/v1/targets';
  }

  async queryVector(queryUrl: string, query: string, bearerToken?: string | null): Promise<any[] | null> {
    const url = this.normalizeQueryUrl(queryUrl);
    const headers: Record<string, string> = {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, {
          params: { query },
          timeout: 10_000,
        }),
      );
      const payload = resp.data as PromResponse;
      if (payload?.status !== 'success') return null;
      const result = payload?.data?.result;
      if (!Array.isArray(result)) return null;
      return result;
    } catch {
      return null;
    }
  }

  async queryScalarDetail(queryUrl: string, query: string, bearerToken?: string | null): Promise<ScalarQueryResult> {
    const url = this.normalizeQueryUrl(queryUrl);
    const headers: Record<string, string> = {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, {
          params: { query },
          timeout: 10_000,
        }),
      );
      const payload = resp.data as PromResponse;
      if (payload?.status !== 'success') return { status: 'error', value: null };
      const result = payload?.data?.result;
      if (!Array.isArray(result)) return { status: 'error', value: null };
      if (result.length === 0) return { status: 'no_data', value: null };
      let total = 0;
      let seen = 0;
      for (const series of result) {
        const raw = series?.value?.[1];
        const n = Number(raw);
        if (Number.isFinite(n)) {
          total += n;
          seen += 1;
        }
      }
      if (seen === 0) return { status: 'error', value: null };
      return { status: 'ok', value: total };
    } catch {
      return { status: 'error', value: null };
    }
  }

  async queryScalarSum(queryUrl: string, query: string, bearerToken?: string | null): Promise<number | null> {
    const vector = await this.queryVector(queryUrl, query, bearerToken);
    if (!vector) return null;
    if (vector.length === 0) return 0;
    let total = 0;
    let seen = 0;
    for (const series of vector) {
      const raw = series?.value?.[1];
      const n = Number(raw);
      if (Number.isFinite(n)) {
        total += n;
        seen += 1;
      }
    }
    if (seen === 0) return null;
    return total;
  }

  async targets(queryUrl: string, bearerToken?: string | null): Promise<PromTarget[] | null> {
    const url = this.normalizeTargetsUrl(queryUrl);
    const headers: Record<string, string> = {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, {
          timeout: 15_000,
        }),
      );
      const payload = resp.data as any;
      if (payload?.status !== 'success') return null;
      const active = payload?.data?.activeTargets;
      if (!Array.isArray(active)) return null;
      return active as PromTarget[];
    } catch {
      return null;
    }
  }

  async labelValues(queryUrl: string, label: string, bearerToken?: string | null): Promise<string[] | null> {
    const url = this.normalizeLabelValuesUrl(queryUrl, label);
    const headers: Record<string, string> = {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, {
          timeout: 15_000,
        }),
      );
      const payload = resp.data as any;
      if (payload?.status !== 'success') return null;
      const values = payload?.data;
      if (!Array.isArray(values)) return null;
      return values.map((v) => String(v));
    } catch {
      return null;
    }
  }

  async queryRangeMatrix(
    queryUrl: string,
    query: string,
    startSec: number,
    endSec: number,
    stepSec: number,
    bearerToken?: string | null,
  ): Promise<any[] | null> {
    const url = this.normalizeQueryRangeUrl(queryUrl);
    const headers: Record<string, string> = {};
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, {
          params: { query, start: startSec, end: endSec, step: stepSec },
          timeout: 15_000,
        }),
      );
      const payload = resp.data as PromResponse;
      if (payload?.status !== 'success') return null;
      const result = payload?.data?.result;
      if (!Array.isArray(result)) return null;
      return result;
    } catch {
      return null;
    }
  }

  async queryRangeScalarSum(
    queryUrl: string,
    query: string,
    startSec: number,
    endSec: number,
    stepSec: number,
    bearerToken?: string | null,
  ): Promise<Array<{ t: number; v: number }> | null> {
    const matrix = await this.queryRangeMatrix(queryUrl, query, startSec, endSec, stepSec, bearerToken);
    if (!matrix || matrix.length === 0) return null;
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
      .map(([t, v]) => ({ t, v }));
    return out.length ? out : null;
  }
}
