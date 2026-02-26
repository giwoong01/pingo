import { api } from '@/utils/api';

export type Cluster = {
  id: string;
  name: string;
  prometheusUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type App = {
  id: string;
  clusterId: string;
  name: string;
  owner: string | null;
  job: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Instance = {
  id: string;
  clusterId: string;
  appId: string | null;
  name: string;
  owner: string | null;
  provider: string;
  publicIp: string | null;
  privateIp: string | null;
  region: string | null;
  env: string | null;
  prometheusInstance: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Rule = {
  id: string;
  appId: string | null;
  instanceId?: string | null;
  name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  kind: string;
  expr: string;
  webhookMode?: 'ALL' | 'SELECTED';
  webhookIds?: string[];
  intervalSeconds: number;
  forSeconds: number;
  cooldownSeconds: number;
  enabled: boolean;
  runbook?: {
    url?: string;
    steps?: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type Webhook = {
  id: string;
  name: string;
  discordUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRoute = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  appId: string | null;
  instanceId: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  webhookIds: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationSilence = {
  id: string;
  name: string;
  enabled: boolean;
  appId: string | null;
  instanceId: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  timezone: string;
  daysOfWeek: number[] | null;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
};

export type RulePreset = {
  id: string;
  kind: string;
  name: string;
  description: string;
  exprTemplate: string;
  defaultThreshold?: string;
  defaultForSeconds: number;
  defaultIntervalSeconds: number;
  defaultCooldownSeconds: number;
};

export type AlertEvent = {
  id: string;
  ruleId: string;
  appId: string | null;
  status: 'FIRING' | 'RESOLVED' | 'DISABLED' | 'ENABLED' | 'NO_DATA' | 'DATASOURCE_ERROR';
  startedAt: string;
  endedAt: string | null;
  value: number | null;
  snapshot: any | null;
  aiReport: AiReport | null;
  createdAt: string;
};

export type AiReportQuality = {
  source: 'llm' | 'fallback';
  reasons: string[];
};

export type AiEvidence = {
  id: string;
  label?: string;
  value?: number | null;
  expr?: string;
  reason?: string;
};

export type AiReport = {
  title?: string;
  summary?: string;
  probable_causes?: string[];
  next_checks?: string[];
  mitigations?: string[];
  confidence?: number;
  quality?: AiReportQuality;
  evidence?: AiEvidence[];
  raw?: any;
};

export type OpsConfigBundle = {
  version: string;
  exportedAt: string;
  workspaceId: string;
  data: {
    clusters: any[];
    apps: any[];
    instances: any[];
    webhooks: any[];
    rules: any[];
    notificationRoutes: any[];
    notificationSilences: any[];
  };
};

export const opsApi = {
  clusters: {
    list: (): Promise<Cluster[]> => api.get('/api/clusters'),
    create: (body: any): Promise<Cluster> => api.post('/api/clusters', body),
    update: (id: string, body: any): Promise<Cluster> => api.patch(`/api/clusters/${id}`, body),
    remove: (id: string): Promise<any> => api.delete(`/api/clusters/${id}`),
    test: (id: string): Promise<any> => api.post(`/api/clusters/${id}/test`, {}),
    jobs: (id: string): Promise<any> => api.get(`/api/clusters/${id}/jobs`),
    jobHints: (id: string): Promise<any> => api.get(`/api/clusters/${id}/job-hints`),
  },
  apps: {
    list: (): Promise<App[]> => api.get('/api/apps'),
    get: (id: string): Promise<App> => api.get(`/api/apps/${id}`),
    health: (): Promise<any[]> => api.get('/api/apps/health'),
    create: (body: any): Promise<App> => api.post('/api/apps', body),
    update: (id: string, body: any): Promise<App> => api.patch(`/api/apps/${id}`, body),
    remove: (id: string): Promise<any> => api.delete(`/api/apps/${id}`),
    testJob: (id: string): Promise<any> => api.post(`/api/apps/${id}/test-job`, {}),
    targets: (id: string): Promise<any> => api.get(`/api/apps/${id}/targets`),
    summary: (id: string, instance?: string): Promise<any> => {
      const qs = new URLSearchParams();
      if (instance) qs.set('instance', instance);
      const suffix = qs.toString();
      return api.get(`/api/apps/${id}/summary${suffix ? `?${suffix}` : ''}`);
    },
    timeseries: (id: string, metric: string, minutes = 60, stepSec = 30, instance?: string): Promise<any> => {
      const qs = new URLSearchParams();
      qs.set('metric', metric);
      qs.set('minutes', String(minutes));
      qs.set('stepSec', String(stepSec));
      if (instance) qs.set('instance', instance);
      return api.get(`/api/apps/${id}/timeseries?${qs.toString()}`);
    },
    customQuery: (id: string, expr: string, instance?: string): Promise<any> => {
      const qs = new URLSearchParams();
      qs.set('expr', expr);
      if (instance) qs.set('instance', instance);
      return api.get(`/api/apps/${id}/custom-query?${qs.toString()}`);
    },
    customTimeseries: (id: string, expr: string, minutes = 60, stepSec = 30, instance?: string): Promise<any> => {
      const qs = new URLSearchParams();
      qs.set('expr', expr);
      qs.set('minutes', String(minutes));
      qs.set('stepSec', String(stepSec));
      if (instance) qs.set('instance', instance);
      return api.get(`/api/apps/${id}/custom-timeseries?${qs.toString()}`);
    },
    getWidgetLayout: (id: string): Promise<{ widgets: any[] | null }> => api.get(`/api/apps/${id}/widget-layout`),
    saveWidgetLayout: (id: string, widgets: any[]): Promise<{ widgets: any[] }> => api.put(`/api/apps/${id}/widget-layout`, { widgets }),
  },
  instances: {
    list: (): Promise<Instance[]> => api.get('/api/instances'),
    get: (id: string): Promise<Instance> => api.get(`/api/instances/${id}`),
    create: (body: any): Promise<Instance> => api.post('/api/instances', body),
    update: (id: string, body: any): Promise<Instance> => api.patch(`/api/instances/${id}`, body),
    remove: (id: string): Promise<any> => api.delete(`/api/instances/${id}`),
    test: (id: string): Promise<any> => api.post(`/api/instances/${id}/test`, {}),
    discover: (clusterId: string): Promise<{ ok: boolean; instances: string[]; targets: string[]; count: number }> =>
      api.get(`/api/instances/cluster/${clusterId}/discover`),
    getWidgetLayout: (id: string): Promise<{ widgets: any[] | null }> => api.get(`/api/instances/${id}/widget-layout`),
    saveWidgetLayout: (id: string, widgets: any[]): Promise<{ widgets: any[] }> => api.put(`/api/instances/${id}/widget-layout`, { widgets }),
  },
  presets: {
    listRulePresets: (): Promise<RulePreset[]> => api.get('/api/presets/rules'),
  },
  rules: {
    list: (appId?: string): Promise<Rule[]> =>
      api.get(appId ? `/api/rules?appId=${encodeURIComponent(appId)}` : '/api/rules'),
    listByScope: (params?: { appId?: string; instanceId?: string }): Promise<Rule[]> => {
      const qs = new URLSearchParams();
      if (params?.appId) qs.set('appId', params.appId);
      if (params?.instanceId) qs.set('instanceId', params.instanceId);
      const suffix = qs.toString();
      return api.get(`/api/rules${suffix ? `?${suffix}` : ''}`);
    },
    create: (body: any): Promise<Rule> => api.post('/api/rules', body),
    createFromPreset: (body: any): Promise<Rule> => api.post('/api/rules/from-preset', body),
    update: (id: string, body: any): Promise<Rule> => api.patch(`/api/rules/${id}`, body),
    remove: (id: string): Promise<any> => api.delete(`/api/rules/${id}`),
    test: (id: string): Promise<any> => api.post(`/api/rules/${id}/test`, {}),
  },
  ruleStates: {
    list: (appId?: string): Promise<any[]> =>
      api.get(appId ? `/api/rule-states?appId=${encodeURIComponent(appId)}` : '/api/rule-states'),
  },
  webhooks: {
    list: (): Promise<Webhook[]> => api.get('/api/webhooks'),
    create: (body: any): Promise<Webhook> => api.post('/api/webhooks', body),
    update: (id: string, body: any): Promise<Webhook> => api.patch(`/api/webhooks/${id}`, body),
    remove: (id: string): Promise<any> => api.delete(`/api/webhooks/${id}`),
    listRoutes: (): Promise<NotificationRoute[]> => api.get('/api/webhooks/routes'),
    createRoute: (body: any): Promise<NotificationRoute> => api.post('/api/webhooks/routes', body),
    updateRoute: (id: string, body: any): Promise<NotificationRoute> => api.patch(`/api/webhooks/routes/${id}`, body),
    removeRoute: (id: string): Promise<any> => api.delete(`/api/webhooks/routes/${id}`),
    listSilences: (): Promise<NotificationSilence[]> => api.get('/api/webhooks/silences'),
    createSilence: (body: any): Promise<NotificationSilence> => api.post('/api/webhooks/silences', body),
    updateSilence: (id: string, body: any): Promise<NotificationSilence> => api.patch(`/api/webhooks/silences/${id}`, body),
    removeSilence: (id: string): Promise<any> => api.delete(`/api/webhooks/silences/${id}`),
  },
  alerts: {
    list: (params?: { appId?: string; instanceId?: string; limit?: number; from?: string; to?: string }): Promise<AlertEvent[]> => {
      const qs = new URLSearchParams();
      qs.set('limit', String(params?.limit || 100));
      if (params?.appId) qs.set('appId', params.appId);
      if (params?.instanceId) qs.set('instanceId', params.instanceId);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      return api.get(`/api/alerts?${qs.toString()}`);
    },
  },
  config: {
    export: (includeSecrets = false): Promise<OpsConfigBundle> =>
      api.get(`/api/ops-config/export?includeSecrets=${includeSecrets ? 'true' : 'false'}`),
    import: (body: { bundle?: OpsConfigBundle; data?: OpsConfigBundle['data']; dryRun?: boolean }): Promise<any> =>
      api.post('/api/ops-config/import', body),
  },
};
