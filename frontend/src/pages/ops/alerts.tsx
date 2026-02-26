import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { opsApi, AlertEvent, App, Instance, Rule } from '@/features/ops/api/ops.api';

const fmtValue = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export default function AlertsPage() {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appFilter, setAppFilter] = useState('');
  const [instanceFilter, setInstanceFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const toIso = (v: string) => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
  };

  const applyQuickRange = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const toInput = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    };
    setFrom(toInput(start));
    setTo(toInput(end));
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, a, i, r] = await Promise.all([
        opsApi.alerts.list({
          appId: appFilter || undefined,
          instanceId: instanceFilter || undefined,
          limit: 500,
          from: toIso(from),
          to: toIso(to),
        }),
        opsApi.apps.list(),
        opsApi.instances.list(),
        opsApi.rules.list(),
      ]);
      setEvents(e);
      setApps(a);
      setInstances(i);
      setRules(r);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const appById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alert Events</h1>
          <p className="text-gray-600 mt-1">firing/resolved 및 룰 활성/비활성 전환 이벤트 기록입니다.</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
          Refresh
        </button>
      </div>

      <div className="mb-4 p-4 rounded-xl border bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-600">App</label>
            <select className="w-full mt-1 px-3 py-2 border rounded-lg" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
              <option value="">All apps</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.job})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Instance Scope</label>
            <select
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
            >
              <option value="">All instances</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.prometheusInstance})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">From</label>
            <input className="w-full mt-1 px-3 py-2 border rounded-lg" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">To</label>
            <input className="w-full mt-1 px-3 py-2 border rounded-lg" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <button type="button" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs" onClick={() => applyQuickRange(1)}>
              1h
            </button>
            <button type="button" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs" onClick={() => applyQuickRange(6)}>
              6h
            </button>
            <button type="button" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs" onClick={() => applyQuickRange(24)}>
              24h
            </button>
            <button type="button" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs" onClick={() => applyQuickRange(24 * 7)}>
              7d
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs"
              onClick={refresh}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="p-5 rounded-xl border bg-white">
        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-gray-600">No events</div>
        ) : (
          <div className="divide-y">
            {events.map((ev) => {
              const app = ev.appId ? appById.get(ev.appId) : undefined;
              const rule = ruleById.get(ev.ruleId);
              const scopedInstance = rule?.instanceId ? instances.find((x) => x.id === rule.instanceId) : null;
              const sev = rule?.severity || 'MEDIUM';
              const isToggleEvent = ev.status === 'DISABLED' || ev.status === 'ENABLED';
              const isNoDataEvent = ev.status === 'NO_DATA';
              const isDatasourceErrorEvent = ev.status === 'DATASOURCE_ERROR';
              const sevCls =
                isToggleEvent
                  ? ev.status === 'DISABLED'
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isNoDataEvent
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : isDatasourceErrorEvent
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : sev === 'CRITICAL'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : sev === 'HIGH'
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : sev === 'MEDIUM'
                  ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200';
              return (
                <div key={ev.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${sevCls}`}>{sev}</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {app ? `${app.name} (${app.job})` : ev.appId || '(unlinked instance)'}
                      </span>
                      <span className="text-xs text-gray-500">{ev.status}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{rule ? rule.name : ev.ruleId}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      scope={scopedInstance ? scopedInstance.prometheusInstance : 'all instances'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {isToggleEvent
                        ? 'rule enabled state changed'
                        : isNoDataEvent
                        ? 'no target series data from Prometheus'
                        : isDatasourceErrorEvent
                        ? 'Prometheus datasource query failed'
                        : `value=${ev.value ?? '-'}`}{' '}
                      • started={ev.startedAt}
                    </div>
                    {rule?.runbook?.url ? (
                      <a
                        href={rule.runbook.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-xs underline text-blue-700 mt-1"
                      >
                        Runbook
                      </a>
                    ) : null}
                    {Array.isArray(rule?.runbook?.steps) && rule?.runbook?.steps?.length ? (
                      <div className="text-xs text-gray-600 mt-1">First step: {rule.runbook.steps[0]}</div>
                    ) : null}
                    {ev.aiReport?.summary && <div className="text-sm text-gray-800 mt-2">{ev.aiReport.summary}</div>}
                    {ev.aiReport?.quality && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            ev.aiReport.quality.source === 'llm'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          AI Source: {ev.aiReport.quality.source.toUpperCase()}
                        </span>
                        {ev.aiReport.quality.reasons?.length ? (
                          <span className="text-xs text-amber-700">
                            사유: {ev.aiReport.quality.reasons.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {ev.aiReport?.evidence?.length ? (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-gray-700">Evidence</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {ev.aiReport.evidence.slice(0, 4).map((x) => (
                            <span key={`${ev.id}-${x.id}`} className="text-xs px-2 py-1 rounded border bg-gray-50 text-gray-700">
                              {x.label || x.id}: {fmtValue(x.value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
