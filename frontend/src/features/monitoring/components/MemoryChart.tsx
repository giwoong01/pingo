import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { HistoricalMetric } from '../types/monitoring.types';

interface MemoryChartProps {
  data: HistoricalMetric[];
}

const formatBytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

const MemoryChart: React.FC<MemoryChartProps> = ({ data }) => {
  const chartData = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
      <h3 className="text-lg font-semibold mb-4">메모리 사용량 추이 (Historical)</h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis 
              dataKey="time" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              tick={{ fill: '#9ca3af' }} 
            />
            <YAxis 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={formatBytes}
              tick={{ fill: '#9ca3af' }}
            />
            <Tooltip 
              formatter={(value: number) => [formatBytes(value), '사용량']}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MemoryChart;