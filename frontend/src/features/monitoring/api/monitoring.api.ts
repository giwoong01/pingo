import { api } from '@/utils/api';
import {
  CurrentMetric,
  HistoryResponse,
  AIAnalysisRequest,
  AIAnalysisResponse,
  InstanceCurrentMetric,
  InstanceTimeseriesResponse,
} from '../types/monitoring.types';

export const monitoringApi = {
  getCurrent: (): Promise<CurrentMetric> => 
    api.get('/api/monitoring/current'),

  getCurrentInstance: (target?: string): Promise<InstanceCurrentMetric> => {
    const qs = new URLSearchParams();
    if (target) qs.set('target', target);
    const suffix = qs.toString();
    return api.get(`/api/monitoring/instance/current${suffix ? `?${suffix}` : ''}`);
  },

  getInstanceTimeseries: (
    metric: string,
    target?: string,
    minutes: number = 60,
    stepSec: number = 30,
  ): Promise<InstanceTimeseriesResponse> => {
    const qs = new URLSearchParams();
    qs.set('metric', metric);
    qs.set('minutes', String(minutes));
    qs.set('stepSec', String(stepSec));
    if (target) qs.set('target', target);
    return api.get(`/api/monitoring/instance/timeseries?${qs.toString()}`);
  },
    
  getHistory: (duration: string = '1h', limit: number = 50): Promise<HistoryResponse> => 
    api.get(`/api/monitoring/history?duration=${duration}&limit=${limit}`),

  analyze: (data: AIAnalysisRequest): Promise<AIAnalysisResponse> =>
    api.post('/api/monitoring/analyze', data),
};
