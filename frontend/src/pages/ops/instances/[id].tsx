import React, { useEffect, useRef, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { opsApi } from '@/features/ops/api/ops.api';
import { monitoringApi } from '@/features/monitoring/api/monitoring.api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Point = { t: number; v: number };
type InstanceWidget = {
  id: string;
  title: string;
  metric: string;
  minutes: number;
  stepSec: number;
  enabled: boolean;
  category: 'Memory' | 'Swap' | 'Load';
  kind: 'recommended' | 'scenario';
};
type WidgetBundle = {
  id: string;
  label: string;
  widgetIds: string[];
};

const WIDGET_PRESETS: InstanceWidget[] = [
  { id: 'memory_usage_percent', title: 'Memory Usage (%)', metric: 'memory_usage_percent', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'recommended' },
  { id: 'memory_used_bytes', title: 'Memory Used (bytes)', metric: 'memory_used_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'recommended' },
  { id: 'swap_usage_percent', title: 'Swap Usage (%)', metric: 'swap_usage_percent', minutes: 180, stepSec: 60, enabled: true, category: 'Swap', kind: 'recommended' },
  { id: 'load1', title: 'Load1', metric: 'load1', minutes: 180, stepSec: 60, enabled: true, category: 'Load', kind: 'recommended' },
  { id: 'memory_total_bytes', title: 'Memory Total (bytes)', metric: 'memory_total_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'scenario' },
  { id: 'memory_available_bytes', title: 'Memory Available (bytes)', metric: 'memory_available_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'recommended' },
  { id: 'memory_cached_bytes', title: 'Memory Cached (bytes)', metric: 'memory_cached_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'scenario' },
  { id: 'memory_buffers_bytes', title: 'Memory Buffers (bytes)', metric: 'memory_buffers_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Memory', kind: 'scenario' },
  { id: 'swap_used_bytes', title: 'Swap Used (bytes)', metric: 'swap_used_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Swap', kind: 'scenario' },
  { id: 'swap_total_bytes', title: 'Swap Total (bytes)', metric: 'swap_total_bytes', minutes: 180, stepSec: 60, enabled: true, category: 'Swap', kind: 'scenario' },
  { id: 'load5', title: 'Load5', metric: 'load5', minutes: 180, stepSec: 60, enabled: true, category: 'Load', kind: 'recommended' },
  { id: 'load15', title: 'Load15', metric: 'load15', minutes: 180, stepSec: 60, enabled: true, category: 'Load', kind: 'scenario' },
];

const RECOMMENDED_WIDGET_IDS = WIDGET_PRESETS.filter((w) => w.kind === 'recommended').map((w) => w.id);
const SCENARIO_BUNDLES: WidgetBundle[] = [
  { id: 'memory_pressure', label: '메모리 압박', widgetIds: ['memory_usage_percent', 'memory_used_bytes', 'memory_available_bytes', 'memory_cached_bytes', 'memory_buffers_bytes'] },
  { id: 'swap_load', label: '스왑/부하', widgetIds: ['swap_usage_percent', 'swap_used_bytes', 'swap_total_bytes', 'load1', 'load5', 'load15'] },
  { id: 'capacity', label: '용량 확인', widgetIds: ['memory_total_bytes', 'memory_used_bytes', 'memory_available_bytes'] },
];

function fmtTs(tSec: number) {
  const d = new Date(tSec * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function fmtBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function defaultWidgets(): InstanceWidget[] {
  return WIDGET_PRESETS.filter((w) => w.kind === 'recommended').map((w) => ({ ...w, enabled: true }));
}

export default function InstanceDetailPage() {
  const router = useRouter();
  const id = String(router.query.id || '');
  const [loading, setLoading] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<any | null>(null);
  const [current, setCurrent] = useState<any | null>(null);
  const [widgets, setWidgets] = useState<InstanceWidget[]>([]);
  const [seriesByWidgetId, setSeriesByWidgetId] = useState<Record<string, Point[]>>({});
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [widgetsHydrated, setWidgetsHydrated] = useState(false);
  const [layoutSaveState, setLayoutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [layoutSavedAt, setLayoutSavedAt] = useState<number | null>(null);
  const lastSavedLayoutRef = useRef('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const t = await opsApi.instances.get(id);
      setTarget(t);
      const c = await monitoringApi.getCurrentInstance(t.prometheusInstance);
      setCurrent(c);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setWidgetsHydrated(false);
    setLayoutSaveState('idle');
    setLayoutSavedAt(null);
    lastSavedLayoutRef.current = '';
    opsApi.instances
      .getWidgetLayout(id)
      .then((res) => {
        if (!alive) return;
        const parsed = Array.isArray(res?.widgets) ? (res.widgets as InstanceWidget[]) : [];
        if (!parsed.length) {
          const defaults = defaultWidgets();
          setWidgets(defaults);
          lastSavedLayoutRef.current = JSON.stringify(defaults);
          return;
        }
        const next = parsed
          .filter((w) => w && w.enabled !== false)
          .map((w) => ({ ...w, enabled: true }));
        setWidgets(next);
        lastSavedLayoutRef.current = JSON.stringify(next);
      })
      .catch(() => {
        if (!alive) return;
        const defaults = defaultWidgets();
        setWidgets(defaults);
        lastSavedLayoutRef.current = JSON.stringify(defaults);
      })
      .finally(() => {
        if (!alive) return;
        setWidgetsHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !widgetsHydrated) return;
    const payload = JSON.stringify(widgets);
    if (payload === lastSavedLayoutRef.current) return;
    const timer = window.setTimeout(() => {
      setLayoutSaveState('saving');
      opsApi.instances
        .saveWidgetLayout(id, widgets)
        .then(() => {
          lastSavedLayoutRef.current = payload;
          setLayoutSaveState('saved');
          setLayoutSavedAt(Date.now());
        })
        .catch(() => {
          setLayoutSaveState('error');
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [id, widgets, widgetsHydrated]);

  useEffect(() => {
    const run = async () => {
      if (!id || !target?.prometheusInstance) return;
      if (widgets.length === 0) {
        setSeriesByWidgetId({});
        return;
      }
      setWidgetLoading(true);
      try {
        const pairs = await Promise.all(
          widgets.map(async (w) => {
            const ts = await monitoringApi.getInstanceTimeseries(w.metric, target.prometheusInstance, w.minutes, w.stepSec);
            return [w.id, (ts?.points || []) as Point[]] as const;
          }),
        );
        const map: Record<string, Point[]> = {};
        pairs.forEach(([wid, points]) => {
          map[wid] = points;
        });
        setSeriesByWidgetId(map);
      } catch (e: any) {
        setError(String(e));
      } finally {
        setWidgetLoading(false);
      }
    };
    run();
  }, [id, target?.prometheusInstance, widgets]);


  const togglePresetWidget = (presetId: string) => {
    setWidgets((prev) => {
      const exists = prev.some((w) => w.id === presetId);
      if (exists) return prev.filter((w) => w.id !== presetId);
      const preset = WIDGET_PRESETS.find((w) => w.id === presetId);
      if (!preset) return prev;
      return [...prev, { ...preset, enabled: true }];
    });
  };

  const isPresetEnabled = (presetId: string) => widgets.some((w) => w.id === presetId);
  const isBundleEnabled = (widgetIds: string[]) => widgetIds.every((wid) => widgets.some((w) => w.id === wid));
  const toggleBundleWidgets = (widgetIds: string[]) => {
    setWidgets((prev) => {
      const allOn = widgetIds.every((wid) => prev.some((w) => w.id === wid));
      if (allOn) return prev.filter((w) => !widgetIds.includes(w.id));
      const existing = new Set(prev.map((w) => w.id));
      const toAdd = WIDGET_PRESETS.filter((w) => widgetIds.includes(w.id) && !existing.has(w.id)).map((w) => ({ ...w, enabled: true }));
      return [...prev, ...toAdd];
    });
  };

  const applyRangeMinutes = (minutes: number) => {
    const m = Math.max(1, Math.floor(minutes));
    setWidgets((prev) => prev.map((w) => ({ ...w, minutes: m })));
  };
  const applyWidgetRangeMinutes = (widgetId: string, minutes: number) => {
    const m = Math.max(1, Math.floor(minutes));
    setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, minutes: m } : w)));
  };

  const applyCustomRange = () => {
    if (!rangeStart || !rangeEnd) {
      setError('구간 검색은 시작/종료 시간을 모두 입력하세요.');
      return;
    }
    const s = Date.parse(rangeStart);
    const e = Date.parse(rangeEnd);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      setError('유효한 구간을 입력하세요. (종료 > 시작)');
      return;
    }
    const minutes = Math.max(1, Math.floor((e - s) / 60000));
    applyRangeMinutes(minutes);
    setError(null);
  };

  const status = String(current?.status || 'UNKNOWN');
  const warnPercent =
    typeof current?.thresholds?.memoryWarnRatio === 'number' && Number.isFinite(current.thresholds.memoryWarnRatio)
      ? current.thresholds.memoryWarnRatio
      : 85;
  const critPercent =
    typeof current?.thresholds?.memoryCriticalRatio === 'number' && Number.isFinite(current.thresholds.memoryCriticalRatio)
      ? current.thresholds.memoryCriticalRatio
      : 95;
  const warnClearPercent =
    typeof current?.thresholds?.memoryWarnClearRatio === 'number' && Number.isFinite(current.thresholds.memoryWarnClearRatio)
      ? current.thresholds.memoryWarnClearRatio
      : Math.max(0, warnPercent - 2);
  const critClearPercent =
    typeof current?.thresholds?.memoryCriticalClearRatio === 'number' &&
    Number.isFinite(current.thresholds.memoryCriticalClearRatio)
      ? current.thresholds.memoryCriticalClearRatio
      : Math.max(0, critPercent - 2);
  const badgeClass =
    status === 'CRITICAL'
      ? 'bg-red-50 text-red-700 border-red-200'
      : status === 'WARNING'
      ? 'bg-orange-50 text-orange-700 border-orange-200'
      : status === 'NORMAL'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-gray-50 text-gray-700 border-gray-200';

  const metricGuide: Record<
    string,
    {
      title: string;
      meaning: string;
      good?: string;
      warn?: string;
      tips?: string;
    }
  > = {
    memory_usage_percent: {
      title: 'Memory Usage (%)',
      meaning: '사용 메모리 비율입니다. ((Total-Available)/Total)*100.',
      good: '< 75%',
      warn: '> 85% (주의), > 95% (심각)',
      tips: 'cached/buffers와 swap 사용률을 함께 보면 실제 압박인지 구분하기 쉽습니다.',
    },
    memory_used_bytes: {
      title: 'Memory Used (bytes)',
      meaning: '현재 사용 중인 메모리 바이트입니다.',
      good: '총 메모리 대비 여유 유지',
      warn: '지속 상승 후 회복 없음',
      tips: 'memory_available_bytes와 같이 보면 누수/압박 여부를 빠르게 판단할 수 있습니다.',
    },
    memory_available_bytes: {
      title: 'Memory Available (bytes)',
      meaning: '커널이 재할당 가능한 여유 메모리입니다.',
      good: '충분한 여유 유지',
      warn: '지속 감소, 바닥 근접',
      tips: '사용량 급증 시 available이 빠르게 줄면 곧 swap/latency 영향이 올 수 있습니다.',
    },
    memory_total_bytes: {
      title: 'Memory Total (bytes)',
      meaning: '인스턴스 전체 물리 메모리 용량입니다.',
      good: '고정값에 가깝게 유지',
      warn: '값 급변(수집 이상 가능성)',
      tips: 'capacity 기준선으로 used/available/swap 지표와 함께 읽어야 의미가 선명해집니다.',
    },
    memory_cached_bytes: {
      title: 'Memory Cached (bytes)',
      meaning: '파일 캐시로 사용 중인 메모리입니다.',
      good: '부하에 따라 유동적',
      warn: 'used는 높지만 cached도 매우 높은 상태',
      tips: 'cached가 높으면 즉시 회수 가능한 메모리일 수 있어, available과 함께 해석하세요.',
    },
    memory_buffers_bytes: {
      title: 'Memory Buffers (bytes)',
      meaning: '버퍼 캐시로 사용하는 메모리입니다.',
      good: '워크로드에 따라 유동',
      warn: '급격한 증가 + available 감소',
      tips: 'buffers 단독보다 used/available/swap과 함께 볼 때 실제 위험도를 판단할 수 있습니다.',
    },
    swap_usage_percent: {
      title: 'Swap Usage (%)',
      meaning: '스왑 사용 비율입니다.',
      good: '< 10%',
      warn: '> 20% (주의), > 40% (심각)',
      tips: 'swap이 오르면 디스크 I/O 지연과 함께 응답 속도 저하가 발생하기 쉽습니다.',
    },
    swap_used_bytes: {
      title: 'Swap Used (bytes)',
      meaning: '현재 사용 중인 스왑 바이트입니다.',
      good: '낮게 유지',
      warn: '지속 증가',
      tips: 'swap_used가 계속 늘면 메모리 압박 누적일 가능성이 큽니다.',
    },
    swap_total_bytes: {
      title: 'Swap Total (bytes)',
      meaning: '시스템 전체 스왑 용량입니다.',
      good: '고정값',
      warn: '0에 가까움(스왑 미구성)',
      tips: 'swap_total이 매우 작으면 메모리 버스트 시 OOM 위험이 커질 수 있습니다.',
    },
    load1: {
      title: 'Load1',
      meaning: '1분 평균 런큐 길이(부하)입니다.',
      good: 'vCPU 수 이하',
      warn: 'vCPU 수 초과가 지속',
      tips: 'load1 상승 시 CPU, 메모리 압박, I/O wait를 같이 확인하세요.',
    },
    load5: {
      title: 'Load5',
      meaning: '5분 평균 부하입니다.',
      good: '완만한 추세',
      warn: '지속 상승',
      tips: 'load1과 load15를 함께 보면 순간 스파이크인지 추세인지 구분됩니다.',
    },
    load15: {
      title: 'Load15',
      meaning: '15분 평균 부하입니다.',
      good: '안정 추세',
      warn: '장기 고부하',
      tips: 'load15가 높게 유지되면 스케일업/워크로드 분산을 검토하세요.',
    },
  };

  const Help = ({ metricKey }: { metricKey: string }) => {
    const g = metricGuide[metricKey];
    const text = g
      ? `${g.title}\n\n의미: ${g.meaning}${g.good ? `\n좋은 기준: ${g.good}` : ''}${g.warn ? `\n주의 기준: ${g.warn}` : ''}${
          g.tips ? `\n팁: ${g.tips}` : ''
        }`
      : '';
    if (!g) return null;
    return (
      <span className="relative ml-1 inline-flex group align-middle">
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          aria-label={`${g.title} help`}
        >
          ?
        </button>
        <span
          className={[
            'pointer-events-none absolute z-20 w-80 max-w-[80vw]',
            'top-6 left-0',
            'opacity-0 scale-95 translate-y-1',
            'group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0',
            'group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-y-0',
            'transition duration-150 ease-out',
            'rounded-xl border bg-white shadow-lg p-3',
            'text-xs text-gray-800 whitespace-pre-line',
          ].join(' ')}
          role="tooltip"
        >
          <span className="font-semibold text-gray-900">{g.title}</span>
          <span className="block mt-2">{text.replace(/^[^\n]*\n\n?/, '')}</span>
        </span>
      </span>
    );
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/ops/instances" className="underline">
              Instances
            </Link>{' '}
            / {target?.name || id}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{target?.name || id}</h1>
          <div className="text-xs text-gray-600 mt-2 font-mono">target={target?.prometheusInstance || '-'} • publicIp={target?.publicIp || '-'}</div>
        </div>
        <div className="flex gap-2">
          <span
            className={
              layoutSaveState === 'saving'
                ? 'px-2 py-2 rounded-lg text-xs border bg-amber-50 text-amber-800 border-amber-200'
                : layoutSaveState === 'saved'
                ? 'px-2 py-2 rounded-lg text-xs border bg-green-50 text-green-700 border-green-200'
                : layoutSaveState === 'error'
                ? 'px-2 py-2 rounded-lg text-xs border bg-red-50 text-red-700 border-red-200'
                : 'px-2 py-2 rounded-lg text-xs border bg-gray-50 text-gray-600 border-gray-200'
            }
          >
            {layoutSaveState === 'saving'
              ? 'Widget saving...'
              : layoutSaveState === 'saved'
              ? `Widget saved${layoutSavedAt ? ` (${new Date(layoutSavedAt).toLocaleTimeString()})` : ''}`
              : layoutSaveState === 'error'
              ? 'Widget save failed'
              : 'Widget idle'}
          </span>
          <button type="button" onClick={() => setEditingWidgets((v) => !v)} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            {editingWidgets ? 'Close Edit Widgets' : 'Edit Widgets'}
          </button>
          <Link href={`/ops/rules?scope=instance&instanceId=${id}`} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            Rules
          </Link>
          <button onClick={load} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            Refresh
          </button>
        </div>
      </div>

      {editingWidgets && (
        <div className="mb-6 p-4 rounded-xl border bg-white">
          <div className="font-semibold text-gray-900 mb-3">Widget Selection</div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleBundleWidgets(RECOMMENDED_WIDGET_IDS)}
              className={
                isBundleEnabled(RECOMMENDED_WIDGET_IDS)
                  ? 'px-3 py-1.5 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                  : 'px-3 py-1.5 rounded-lg text-xs border bg-white hover:bg-gray-50'
              }
            >
              추천 위젯 세트
            </button>
            {SCENARIO_BUNDLES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBundleWidgets(b.widgetIds)}
                className={
                  isBundleEnabled(b.widgetIds)
                    ? 'px-3 py-1.5 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                    : 'px-3 py-1.5 rounded-lg text-xs border bg-white hover:bg-gray-50'
                }
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {(['Memory', 'Swap', 'Load'] as const).map((cat) => (
              <div key={cat}>
                <div className="text-[11px] text-gray-500 mb-1">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {WIDGET_PRESETS.filter((w) => w.category === cat).map((w) => {
                    const on = isPresetEnabled(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => togglePresetWidget(w.id)}
                        className={
                          on
                            ? 'px-2 py-1 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                            : 'px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50'
                        }
                      >
                        {w.title} {on ? 'ON' : 'OFF'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 p-4 rounded-xl border bg-white">
        <div className="text-xs text-gray-500 mb-2">Time Range</div>
        <div className="flex flex-wrap items-center gap-2">
          {[60, 180, 360, 720, 1440].map((m) => (
            <button key={m} type="button" className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50" onClick={() => applyRangeMinutes(m)}>
              {m >= 60 ? `${m / 60}h` : `${m}m`}
            </button>
          ))}
          <input type="datetime-local" className="px-2 py-1 rounded-lg border text-xs" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          <input type="datetime-local" className="px-2 py-1 rounded-lg border text-xs" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          <button type="button" className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50" onClick={applyCustomRange}>
            Apply
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-4">Loading...</div>}
      {widgetLoading && <div className="text-sm text-gray-600 mb-4">Loading widgets...</div>}

      {target && current && (
        <>
          <div className="p-5 rounded-xl border bg-white mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-gray-900">Metrics Guide</div>
                <div className="text-xs text-gray-600 mt-1">인스턴스 지표의 의미와 운영 기준을 빠르게 확인합니다.</div>
              </div>
              <button type="button" onClick={() => setShowGuide((v) => !v)} className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs">
                {showGuide ? 'Hide' : 'Show'}
              </button>
            </div>
            {showGuide && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.values(metricGuide).map((g) => (
                  <div key={g.title} className="p-4 rounded-xl border bg-gray-50">
                    <div className="text-sm font-semibold text-gray-900">{g.title}</div>
                    <div className="text-xs text-gray-700 mt-1">{g.meaning}</div>
                    {g.good ? <div className="text-xs text-emerald-700 mt-2">좋은 기준: {g.good}</div> : null}
                    {g.warn ? <div className="text-xs text-orange-700 mt-1">주의 기준: {g.warn}</div> : null}
                    {g.tips ? <div className="text-xs text-gray-600 mt-2">팁: {g.tips}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-xl border bg-white mb-6">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">Current Status</div>
              <span className={`text-xs px-2 py-1 rounded border ${badgeClass}`}>{status}</span>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              기준: NORMAL &lt; {warnPercent}% • WARNING ≥ {warnPercent}% • CRITICAL ≥ {critPercent}% • UNKNOWN = 메모리 총량/사용량 계산 불가
            </div>
            <div className="mt-1 text-xs text-gray-500">
              히스테리시스: WARNING 해제 &lt; {warnClearPercent}% • CRITICAL 해제 &lt; {critClearPercent}%
            </div>
            <div className="mt-1 text-xs text-gray-500">
              sampled at: {current?.timestamp ? new Date(current.timestamp).toLocaleTimeString() : '-'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="text-xs text-gray-500 flex items-center">Memory Usage <Help metricKey="memory_usage_percent" /></div>
                <div className="text-lg font-semibold text-gray-900 mt-1">{current?.signals?.memoryUsagePercent != null ? `${current.signals.memoryUsagePercent}%` : '-'}</div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="text-xs text-gray-500 flex items-center">Used / Total <Help metricKey="memory_used_bytes" /></div>
                <div className="text-sm font-semibold text-gray-900 mt-1">
                  {fmtBytes(current?.signals?.memoryUsedBytes)} / {fmtBytes(current?.signals?.memoryTotalBytes)}
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="text-xs text-gray-500 flex items-center">Swap Usage <Help metricKey="swap_usage_percent" /></div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{current?.signals?.swapUsagePercent != null ? `${current.signals.swapUsagePercent}%` : '-'}</div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="text-xs text-gray-500 flex items-center">Load1 <Help metricKey="load1" /></div>
                <div className="text-lg font-semibold text-gray-900 mt-1">{current?.signals?.load1 != null ? current.signals.load1 : '-'}</div>
              </div>
            </div>
          </div>

          {widgets.length === 0 ? (
            <div className="p-6 rounded-xl border bg-white text-sm text-gray-600">No widgets selected. Edit Widgets에서 위젯을 ON 하세요.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {widgets.map((w) => {
                const points = seriesByWidgetId[w.id] || [];
                return (
                  <div key={w.id} className="p-5 rounded-xl border bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-semibold text-gray-900 flex items-center">
                        {w.title}
                        <Help metricKey={w.metric} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {[60, 180, 360, 720].map((m) => (
                          <button
                            key={`${w.id}_r_${m}`}
                            type="button"
                            onClick={() => applyWidgetRangeMinutes(w.id, m)}
                            className="px-2 py-1 rounded border text-xs"
                          >
                            {m / 60}h
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 mb-3 font-mono">metric={w.metric} • {w.minutes}m/{w.stepSec}s</div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={points.map((p) => ({ ...p, label: fmtTs(p.t) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
