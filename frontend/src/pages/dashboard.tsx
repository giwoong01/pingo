import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import Link from 'next/link';
import { opsApi, App, AlertEvent, Rule, Instance } from '@/features/ops/api/ops.api';
import { monitoringApi } from '@/features/monitoring/api/monitoring.api';
import { InstanceCurrentMetric } from '@/features/monitoring/types/monitoring.types';

const fmtValue = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export default function Dashboard() {
  const [clusters, setClusters] = useState<any[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [ruleStates, setRuleStates] = useState<any[]>([]);
  const [appHealth, setAppHealth] = useState<any[]>([]);
  const [instanceRows, setInstanceRows] = useState<Array<{ target: Instance; metric: InstanceCurrentMetric | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a, r, e, s, h, i] = await Promise.all([
        opsApi.clusters.list(),
        opsApi.apps.list(),
        opsApi.rules.list(),
        opsApi.alerts.list({ limit: 50 }),
        opsApi.ruleStates.list(),
        opsApi.apps.health(),
        opsApi.instances.list(),
      ]);
      setClusters(c);
      setApps(a);
      setRules(r);
      setEvents(e);
      setRuleStates(s);
      setAppHealth(h);
      const rows = await Promise.all(
        i.map(async (target) => {
          try {
            const metric = await monitoringApi.getCurrentInstance(target.prometheusInstance);
            return { target, metric };
          } catch {
            return { target, metric: null };
          }
        }),
      );
      setInstanceRows(rows);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const latestFiringByAppId = useMemo(() => {
    const m = new Map<string, AlertEvent>();
    for (const ev of events) {
      if (ev.status !== 'FIRING') continue;
      if (!ev.appId) continue;
      if (!m.has(ev.appId)) m.set(ev.appId, ev);
    }
    return m;
  }, [events]);

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const rulesByAppId = useMemo(() => {
    const m = new Map<string, Rule[]>();
    for (const r of rules) {
      if (!r.appId) continue;
      const arr = m.get(r.appId) ?? [];
      arr.push(r);
      m.set(r.appId, arr);
    }
    return m;
  }, [rules]);
  const statesByAppId = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of ruleStates) {
      const appId = s?.appId;
      if (!appId) continue;
      const arr = m.get(appId) ?? [];
      arr.push(s);
      m.set(appId, arr);
    }
    return m;
  }, [ruleStates]);

  const healthByAppId = useMemo(() => {
    const m = new Map<string, any>();
    for (const h of appHealth) {
      if (h?.appId) m.set(h.appId, h);
    }
    return m;
  }, [appHealth]);
  const appLabelById = useMemo(() => {
    const m = new Map<string, string>();
    apps.forEach((a) => m.set(a.id, `${a.name} (${a.job})`));
    return m;
  }, [apps]);

  const fmtBytes = (bytes: number | null | undefined) => {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const instanceBadgeClass = (status?: string | null) =>
    status === 'CRITICAL'
      ? 'bg-red-50 text-red-700 border-red-200'
      : status === 'WARNING'
      ? 'bg-orange-50 text-orange-700 border-orange-200'
      : status === 'NORMAL'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-gray-50 text-gray-700 border-gray-200';

  const onboardingChecklist = [
    { id: 'cluster', label: 'Cluster 연결', done: clusters.length > 0 },
    { id: 'app', label: 'App 등록', done: apps.length > 0 },
    { id: 'instance', label: 'Instance 등록', done: instanceRows.length > 0 },
    { id: 'rule', label: 'Rule 생성', done: rules.length > 0 },
  ];
  const onboardingDoneCount = onboardingChecklist.filter((x) => x.done).length;
  const onboardingCompleted = onboardingDoneCount === onboardingChecklist.length;
  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">멀티 앱 대시보드</h1>
          <p className="text-gray-600 mt-1">job 기반으로 등록된 앱들의 상태와 최근 알림을 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            Refresh
          </button>
          <Link href="/ops" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
            설정
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {!onboardingCompleted ? (
        <div className="mb-6 p-4 rounded-2xl border bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-amber-900">온보딩 진행 필요</div>
              <div className="text-xs text-amber-800 mt-1">
                {onboardingDoneCount}/{onboardingChecklist.length} 완료. 클러스터→앱/인스턴스→룰 순서로 구성하세요.
              </div>
            </div>
            <Link href="/ops/onboarding" className="px-3 py-2 rounded-lg text-xs bg-amber-600 text-white hover:bg-amber-700">
              Onboarding 열기
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onboardingChecklist.map((x) => (
              <span
                key={x.id}
                className={
                  x.done
                    ? 'text-xs px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200'
                    : 'text-xs px-2 py-1 rounded border bg-white text-amber-900 border-amber-300'
                }
              >
                {x.label}: {x.done ? 'DONE' : 'TODO'}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Instances Memory</h2>
                <div className="text-xs text-gray-600 mt-1">등록한 클라우드 VM 상태를 요약해서 보여줍니다.</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700">
                {instanceRows.length} instances
              </span>
            </div>
            {loading ? (
              <div className="text-sm text-gray-600">Loading...</div>
            ) : instanceRows.length === 0 ? (
              <div className="text-sm text-gray-600">
                인스턴스가 없습니다. <Link href="/ops/instances" className="underline">/ops/instances</Link> 에서 등록하세요.
              </div>
            ) : (
              <div className="space-y-2">
                {instanceRows.map(({ target, metric }) => (
                  <div key={target.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{target.name}</div>
                        <div className="text-xs text-gray-600 truncate font-mono">
                          {target.publicIp || '-'} • {target.prometheusInstance}
                        </div>
                        {target.appId ? (
                          <div className="text-xs text-gray-500 mt-1">linked app: {appLabelById.get(target.appId) || target.appId}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded border ${instanceBadgeClass(metric?.status || null)}`}>
                          {metric?.status || 'UNKNOWN'}
                        </span>
                        <Link
                          href={`/ops/instances/${target.id}`}
                          className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </Link>
                        <Link
                          href={`/ops/rules?scope=instance&instanceId=${target.id}`}
                          className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        >
                          Rules
                        </Link>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      {metric ? (() => {
                        const signals = metric.signals || {};
                        return (
                          <>
                            mem={signals.memoryUsagePercent != null ? `${signals.memoryUsagePercent}%` : '-'} •
                            swap={signals.swapUsagePercent != null ? `${signals.swapUsagePercent}%` : '-'} •
                            load1={signals.load1 != null ? signals.load1 : '-'} •
                            used={fmtBytes(signals.memoryUsedBytes)} / total={fmtBytes(signals.memoryTotalBytes)} •
                            at={metric.timestamp ? new Date(metric.timestamp).toLocaleTimeString() : '-'}
                          </>
                        );
                      })() : <>metric unavailable</>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-white">{target.provider}</span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-white">{target.env || '-'}</span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-white">{target.region || '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">Apps</h2>
            <span className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              {apps.length} apps
            </span>
          </div>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : apps.length === 0 ? (
            <div className="text-sm text-gray-600">
              앱이 없습니다. <Link href="/ops/apps" className="underline">/ops/apps</Link> 에서 등록하세요.
            </div>
          ) : (
            <div className="space-y-2">
              {apps.map((a) => {
                const firing = latestFiringByAppId.get(a.id);
                const rule = firing ? ruleById.get(firing.ruleId) : null;
                const activeFiring = Boolean(firing && rule?.enabled);
                const sev = rule?.severity || null;
                const appRules = rulesByAppId.get(a.id) ?? [];
                const enabledRules = appRules.filter((x) => x.enabled);
                const enabledRuleIds = new Set(enabledRules.map((x) => x.id));
                const hasRulesButAllDisabled = appRules.length > 0 && enabledRules.length === 0;
                const appStates = statesByAppId.get(a.id) ?? [];
                const relevantStates = appStates.filter((s) => enabledRuleIds.has(String(s?.ruleId || '')));
                const hasNoData = relevantStates.some((s) => String(s?.lastEvalCategory || '') === 'NO_DATA');
                const hasDatasourceError = relevantStates.some(
                  (s) => String(s?.lastEvalCategory || '') === 'DATASOURCE_ERROR',
                );
                const anyEvalFail = relevantStates.some((s) => s?.lastEvalOk === false);
                const health = healthByAppId.get(a.id);
                const healthStatus = String(health?.healthStatus || '').toUpperCase();
                const isDown = healthStatus ? healthStatus === 'DOWN' : health && typeof health.upSum === 'number' && health.seriesCount > 0 && health.upSum <= 0;
                const isDegraded = healthStatus === 'DEGRADED';
                const isUnknown = healthStatus ? healthStatus === 'UNKNOWN' : health && (health.seriesCount === null || health.seriesCount === 0);
                const downReason = health?.targetReason ? String(health.targetReason) : null;
                const downHint =
                  downReason === 'timeout'
                    ? 'scrape timeout'
                    : downReason === 'dns'
                    ? 'dns'
                    : downReason === 'conn_refused'
                    ? 'conn refused'
                    : downReason === 'network'
                    ? 'network'
                    : downReason === 'auth'
                    ? 'auth'
                    : downReason === 'stale'
                    ? 'stale'
                    : downReason === 'error'
                    ? 'error'
                    : null;
                const badge =
                  activeFiring && sev === 'CRITICAL'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : activeFiring && sev === 'HIGH'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : activeFiring && sev === 'MEDIUM'
                    ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                    : hasRulesButAllDisabled
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : isDown
                    ? 'bg-gray-50 text-gray-800 border-gray-200'
                    : isDegraded
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : hasNoData
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : hasDatasourceError
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : anyEvalFail
                    ? 'bg-gray-50 text-gray-700 border-gray-200'
                    : 'bg-green-50 text-green-700 border-green-200';
                const label = activeFiring
                  ? `${sev}`
                  : hasRulesButAllDisabled
                  ? 'DISABLED'
                  : isDown
                  ? `DOWN${downHint ? `(${downHint})` : ''}`
                  : isDegraded
                  ? 'DEGRADED'
                  : hasNoData
                  ? 'NO_DATA'
                  : hasDatasourceError
                  ? 'DATASOURCE_ERROR'
                  : anyEvalFail
                  ? 'FALSE'
                  : isUnknown
                  ? 'UNKNOWN'
                  : 'OK';
                return (
                  <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {a.name} <span className="text-xs text-gray-500">({a.job})</span>
                      </div>
                      {firing && activeFiring ? (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          {rule?.name || firing.ruleId} • value={firing.value ?? '-'}
                        </div>
                      ) : isDown ? (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          {downHint ? `Targets down (${downHint})` : 'All targets down'} • up={health?.upSum ?? '-'} •{' '}
                          {health?.lastScrapeAgeSec != null ? `lastScrape ${health.lastScrapeAgeSec}s ago` : 'lastScrape -'}
                        </div>
                      ) : isDegraded ? (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          Partial target down • upTargets={health?.targetUpCount ?? '-'} • downTargets={health?.targetDownCount ?? '-'}
                        </div>
                      ) : hasNoData ? (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          No target data in Prometheus (rule alerting paused)
                        </div>
                      ) : hasDatasourceError ? (
                        <div className="text-xs text-gray-600 truncate mt-1">
                          Prometheus datasource query failed (rule alerting paused)
                        </div>
                      ) : hasRulesButAllDisabled ? (
                        <div className="text-xs text-gray-600 truncate mt-1">All rules are disabled</div>
                      ) : anyEvalFail ? (
                        <div className="text-xs text-gray-600 truncate mt-1">Rule evaluation failed (Prometheus)</div>
                      ) : (
                        <div className="text-xs text-gray-600 truncate mt-1">No firing alerts</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${badge}`}>{label}</span>
                      <Link
                        href={`/ops/apps/${a.id}`}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        View
                      </Link>
                      <Link
                        href="/ops/rules"
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        Rules
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        <div className="lg:col-span-1 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-900">Recent Alerts</h2>
            <span className="text-xs px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-700">
              {events.length}
            </span>
          </div>
          {events.length === 0 ? (
            <div className="text-sm text-gray-600">No events</div>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 10).map((ev) => {
                const rule = ruleById.get(ev.ruleId);
                const isToggleEvent = ev.status === 'DISABLED' || ev.status === 'ENABLED';
                const statusCls =
                  ev.status === 'FIRING'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : ev.status === 'RESOLVED'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : ev.status === 'NO_DATA'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : ev.status === 'DATASOURCE_ERROR'
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : ev.status === 'DISABLED'
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                const toggleText =
                  ev.status === 'DISABLED'
                    ? 'Rule disabled (notifications paused)'
                    : ev.status === 'ENABLED'
                    ? 'Rule enabled (evaluation resumed)'
                    : '';
                return (
                  <div key={ev.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${statusCls}`}>{ev.status}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{rule?.name || ev.ruleId}</div>
                    <div className="text-xs text-gray-600 mt-1">{isToggleEvent ? toggleText : `value=${ev.value ?? '-'}`}</div>
                    {rule?.runbook?.url ? (
                      <a
                        href={rule.runbook.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 mt-2"
                      >
                        Runbook
                      </a>
                    ) : null}
                    {Array.isArray(rule?.runbook?.steps) && rule?.runbook?.steps?.length ? (
                      <div className="text-[11px] text-gray-600 mt-1 line-clamp-2">
                        Step: {rule.runbook.steps[0]}
                      </div>
                    ) : null}
                    {!isToggleEvent && ev.aiReport?.summary && (
                      <div className="text-xs text-gray-700 mt-2 line-clamp-4">{ev.aiReport.summary}</div>
                    )}
                    {!isToggleEvent && ev.aiReport?.quality && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border ${
                            ev.aiReport.quality.source === 'llm'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          AI: {ev.aiReport.quality.source.toUpperCase()}
                        </span>
                        {ev.aiReport.quality.reasons?.length ? (
                          <span className="text-[11px] text-amber-700 line-clamp-1">
                            {ev.aiReport.quality.reasons.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {!isToggleEvent && ev.aiReport?.evidence?.length ? (
                      <div className="text-[11px] text-gray-600 mt-2 line-clamp-2">
                        Evidence:{' '}
                        {ev.aiReport.evidence
                          .slice(0, 2)
                          .map((x) => `${x.label || x.id}=${fmtValue(x.value)}`)
                          .join(' • ')}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <Link
                href="/ops/alerts"
                className="inline-block text-xs px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                View all
              </Link>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
