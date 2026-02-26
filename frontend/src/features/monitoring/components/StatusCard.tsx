import React from 'react';
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import { MonitoringStatus, RuntimeSignals } from '../types/monitoring.types';

interface StatusCardProps {
  value: number;
  status: MonitoringStatus;
  timestamp: string;
  heapMaxBytes: number;
  heapUsagePercent: number;
  signals: RuntimeSignals;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatNumber = (value: number | null, digits: number, suffix: string = '') => {
  if (value === null) return '-';
  return `${value.toFixed(digits)}${suffix}`;
};

const StatusCard: React.FC<StatusCardProps> = ({ value, status, timestamp, heapMaxBytes, heapUsagePercent, signals }) => {
  const statusConfig = {
    NORMAL: { color: 'text-green-600', bg: 'bg-green-50', icon: ShieldCheck, label: '정상' },
    WARNING: { color: 'text-yellow-600', bg: 'bg-yellow-50', icon: AlertTriangle, label: '주의' },
    CRITICAL: { color: 'text-red-600', bg: 'bg-red-50', icon: Activity, label: '위험' },
  };

  const config = statusConfig[status] || statusConfig.NORMAL;
  const Icon = config.icon;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">현재 JVM 힙 메모리 사용량</p>
          <h3 className="text-3xl font-bold mt-1">{formatBytes(value)}</h3>
        </div>
        <div className={`p-3 rounded-lg ${config.bg}`}>
          <Icon className={`w-6 h-6 ${config.color}`} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
          상태: {config.label}
        </span>
        <span className="text-xs text-gray-400 font-mono">
          업데이트: {new Date(timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">Heap 사용률</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(heapUsagePercent, 2, '%')}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">Heap 최대치</div>
          <div className="mt-1 font-semibold text-gray-900">{formatBytes(heapMaxBytes)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">CPU (core/s)</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.cpuUsageCores, 4)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">GC Avg Pause</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.gcPauseAvgMs, 2, ' ms')}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">DB Active</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.dbConnectionsActive, 2)}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">HTTP 5xx Rate</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.http5xxRate, 2, '%')}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">HTTP 4xx Rate</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.http4xxRate, 2, '%')}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-gray-500">HTTP 2xx Rate</div>
          <div className="mt-1 font-semibold text-gray-900">{formatNumber(signals.http2xxRate, 2, '%')}</div>
        </div>
      </div>
    </div>
  );
};

export default StatusCard;
