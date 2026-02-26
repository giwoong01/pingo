import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { App, Instance, NotificationRoute, NotificationSilence, opsApi, Webhook } from '@/features/ops/api/ops.api';

const DAYS = [
  { n: 0, label: 'Sun' },
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
];

function HelpTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1">
      <button type="button" className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] text-gray-600 bg-white hover:bg-gray-50">
        ?
      </button>
      <span className="pointer-events-none absolute z-20 w-80 max-w-[80vw] top-5 left-0 opacity-0 group-hover:opacity-100 transition rounded-xl border bg-white shadow-lg p-3 text-xs text-gray-800 whitespace-pre-line">
        {text}
      </span>
    </span>
  );
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [routes, setRoutes] = useState<NotificationRoute[]>([]);
  const [silences, setSilences] = useState<NotificationSilence[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [webhookForm, setWebhookForm] = useState({ name: '', discordUrl: '' });
  const [routeForm, setRouteForm] = useState({
    name: '',
    priority: 100,
    severity: '',
    appId: '',
    instanceId: '',
    webhookIds: [] as string[],
  });
  const [silenceForm, setSilenceForm] = useState({
    name: '',
    severity: '',
    appId: '',
    instanceId: '',
    timezone: 'UTC',
    daysOfWeek: [] as number[],
    startTime: '22:00',
    endTime: '08:00',
  });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [wh, rt, si, ap, ins] = await Promise.all([
        opsApi.webhooks.list(),
        opsApi.webhooks.listRoutes(),
        opsApi.webhooks.listSilences(),
        opsApi.apps.list(),
        opsApi.instances.list(),
      ]);
      setWebhooks(wh || []);
      setRoutes(rt || []);
      setSilences(si || []);
      setApps(ap || []);
      setInstances(ins || []);
    } catch (e: any) {
      setError(String(e || 'Failed to load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const appLabel = useMemo(() => {
    const m = new Map<string, string>();
    apps.forEach((a) => m.set(a.id, `${a.name} (${a.job})`));
    return m;
  }, [apps]);

  const instanceLabel = useMemo(() => {
    const m = new Map<string, string>();
    instances.forEach((i) => m.set(i.id, `${i.name} (${i.prometheusInstance})`));
    return m;
  }, [instances]);

  const createWebhook = async () => {
    setError(null);
    try {
      await opsApi.webhooks.create({ ...webhookForm });
      setWebhookForm({ name: '', discordUrl: '' });
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Webhook create failed'));
    }
  };

  const createRoute = async () => {
    setError(null);
    try {
      await opsApi.webhooks.createRoute({
        name: String(routeForm.name || '').trim(),
        priority: Number(routeForm.priority || 100),
        severity: routeForm.severity || undefined,
        appId: routeForm.appId || undefined,
        instanceId: routeForm.instanceId || undefined,
        webhookIds: routeForm.webhookIds,
      });
      setRouteForm({ name: '', priority: 100, severity: '', appId: '', instanceId: '', webhookIds: [] });
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Route create failed'));
    }
  };

  const createSilence = async () => {
    setError(null);
    try {
      await opsApi.webhooks.createSilence({
        name: String(silenceForm.name || '').trim(),
        severity: silenceForm.severity || undefined,
        appId: silenceForm.appId || undefined,
        instanceId: silenceForm.instanceId || undefined,
        timezone: String(silenceForm.timezone || 'UTC').trim() || 'UTC',
        daysOfWeek: silenceForm.daysOfWeek,
        startTime: silenceForm.startTime,
        endTime: silenceForm.endTime,
      });
      setSilenceForm({
        name: '',
        severity: '',
        appId: '',
        instanceId: '',
        timezone: 'UTC',
        daysOfWeek: [],
        startTime: '22:00',
        endTime: '08:00',
      });
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Silence create failed'));
    }
  };

  const removeWebhook = async (id: string) => {
    if (!confirm('Delete webhook?')) return;
    try {
      await opsApi.webhooks.remove(id);
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Webhook remove failed'));
    }
  };

  const removeRoute = async (id: string) => {
    if (!confirm('Delete route?')) return;
    try {
      await opsApi.webhooks.removeRoute(id);
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Route remove failed'));
    }
  };

  const removeSilence = async (id: string) => {
    if (!confirm('Delete silence?')) return;
    try {
      await opsApi.webhooks.removeSilence(id);
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Silence remove failed'));
    }
  };

  const toggleRoute = async (row: NotificationRoute) => {
    try {
      await opsApi.webhooks.updateRoute(row.id, { enabled: !row.enabled });
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Route update failed'));
    }
  };

  const toggleSilence = async (row: NotificationSilence) => {
    try {
      await opsApi.webhooks.updateSilence(row.id, { enabled: !row.enabled });
      await refresh();
    } catch (e: any) {
      setError(String(e || 'Silence update failed'));
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks / Routing / Silence</h1>
          <p className="text-gray-600 mt-1">알림 채널 등록 + 라우팅 정책 + 무음 시간대를 함께 관리합니다.</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Create Webhook
            <HelpTip text={'실제 Discord 발송 채널입니다.\n라우팅 정책에서 이 채널들을 선택해 알림 목적지를 제어합니다.'} />
          </h2>
          <label className="text-xs text-gray-600">Name</label>
          <input className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg" value={webhookForm.name} onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))} />
          <label className="text-xs text-gray-600">Discord Webhook URL</label>
          <input className="w-full mt-1 mb-4 px-3 py-2 border rounded-lg" value={webhookForm.discordUrl} onChange={(e) => setWebhookForm((f) => ({ ...f, discordUrl: e.target.value }))} />
          <button onClick={createWebhook} className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
            Create
          </button>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Create Route Policy
            <HelpTip text={'우선순위(priority) 순서로 매칭됩니다.\n매칭되면 해당 webhookIds로만 발송됩니다(없으면 발송 억제).\n미매칭이면 기존 룰 webhook 설정(SELECTED/ALL)을 사용합니다.'} />
          </h2>
          <label className="text-xs text-gray-600">Name</label>
          <input className="w-full mt-1 mb-2 px-3 py-2 border rounded-lg" value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-600">Priority</label>
              <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg" value={routeForm.priority} onChange={(e) => setRouteForm((f) => ({ ...f, priority: Number(e.target.value || 100) }))} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Severity</label>
              <select className="w-full mt-1 px-3 py-2 border rounded-lg" value={routeForm.severity} onChange={(e) => setRouteForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="">ALL</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>
          <label className="text-xs text-gray-600">App (optional)</label>
          <select className="w-full mt-1 mb-2 px-3 py-2 border rounded-lg" value={routeForm.appId} onChange={(e) => setRouteForm((f) => ({ ...f, appId: e.target.value }))}>
            <option value="">ALL</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.job})</option>
            ))}
          </select>
          <label className="text-xs text-gray-600">Instance (optional)</label>
          <select className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg" value={routeForm.instanceId} onChange={(e) => setRouteForm((f) => ({ ...f, instanceId: e.target.value }))}>
            <option value="">ALL</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <div className="text-xs text-gray-600 mb-1">Target Webhooks</div>
          <div className="max-h-24 overflow-auto border rounded-lg p-2 mb-3">
            {webhooks.map((w) => {
              const checked = routeForm.webhookIds.includes(w.id);
              return (
                <label key={w.id} className="flex items-center gap-2 text-xs py-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...routeForm.webhookIds, w.id]
                        : routeForm.webhookIds.filter((id) => id !== w.id);
                      setRouteForm((f) => ({ ...f, webhookIds: next }));
                    }}
                  />
                  {w.name}
                </label>
              );
            })}
          </div>
          <button onClick={createRoute} className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm">Create Route</button>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Create Silence Window
            <HelpTip text={'해당 시간대에는 알림 발송만 억제합니다.\n룰 평가/이벤트 저장은 계속되므로 사후 분석은 가능합니다.\n(유지보수/야간 무음에 사용)'} />
          </h2>
          <label className="text-xs text-gray-600">Name</label>
          <input className="w-full mt-1 mb-2 px-3 py-2 border rounded-lg" value={silenceForm.name} onChange={(e) => setSilenceForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-600">Severity</label>
              <select className="w-full mt-1 px-3 py-2 border rounded-lg" value={silenceForm.severity} onChange={(e) => setSilenceForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="">ALL</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Timezone</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg" value={silenceForm.timezone} onChange={(e) => setSilenceForm((f) => ({ ...f, timezone: e.target.value }))} />
            </div>
          </div>
          <label className="text-xs text-gray-600">App (optional)</label>
          <select className="w-full mt-1 mb-2 px-3 py-2 border rounded-lg" value={silenceForm.appId} onChange={(e) => setSilenceForm((f) => ({ ...f, appId: e.target.value }))}>
            <option value="">ALL</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.job})</option>
            ))}
          </select>
          <label className="text-xs text-gray-600">Instance (optional)</label>
          <select className="w-full mt-1 mb-2 px-3 py-2 border rounded-lg" value={silenceForm.instanceId} onChange={(e) => setSilenceForm((f) => ({ ...f, instanceId: e.target.value }))}>
            <option value="">ALL</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-600">Start (HH:mm)</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg" value={silenceForm.startTime} onChange={(e) => setSilenceForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-600">End (HH:mm)</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg" value={silenceForm.endTime} onChange={(e) => setSilenceForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          <div className="text-xs text-gray-600 mb-1">Days (empty = every day)</div>
          <div className="flex flex-wrap gap-1 mb-3">
            {DAYS.map((d) => {
              const on = silenceForm.daysOfWeek.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => {
                    const next = on ? silenceForm.daysOfWeek.filter((n) => n !== d.n) : [...silenceForm.daysOfWeek, d.n];
                    setSilenceForm((f) => ({ ...f, daysOfWeek: next }));
                  }}
                  className={on ? 'px-2 py-1 rounded border text-xs bg-blue-600 text-white border-blue-600' : 'px-2 py-1 rounded border text-xs bg-white'}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <button onClick={createSilence} className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm">Create Silence</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Webhook List</h2>
          {loading ? <div className="text-sm text-gray-600">Loading...</div> : null}
          <div className="space-y-2">
            {webhooks.map((w) => (
              <div key={w.id} className="p-2 rounded border bg-gray-50">
                <div className="text-sm font-medium text-gray-900 truncate">{w.name}</div>
                <div className="text-[11px] text-gray-600 truncate">{w.discordUrl}</div>
                <div className="mt-2">
                  <button onClick={() => removeWebhook(w.id)} className="px-2 py-1 rounded border border-red-200 text-red-700 bg-white text-xs">Delete</button>
                </div>
              </div>
            ))}
            {webhooks.length === 0 ? <div className="text-sm text-gray-600">No webhooks</div> : null}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Route Policy List</h2>
          <div className="space-y-2">
            {routes.map((r) => (
              <div key={r.id} className="p-2 rounded border bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                  <span className={r.enabled ? 'text-[11px] px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200' : 'text-[11px] px-2 py-0.5 rounded border bg-gray-100 text-gray-700'}>{r.enabled ? 'ENABLED' : 'DISABLED'}</span>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  priority={r.priority} • severity={r.severity || 'ALL'}
                </div>
                <div className="text-[11px] text-gray-600">app={r.appId ? appLabel.get(r.appId) || r.appId : 'ALL'}</div>
                <div className="text-[11px] text-gray-600">instance={r.instanceId ? instanceLabel.get(r.instanceId) || r.instanceId : 'ALL'}</div>
                <div className="text-[11px] text-gray-600">webhooks={(r.webhookIds || []).length === 0 ? '(none)' : (r.webhookIds || []).map((id) => webhooks.find((w) => w.id === id)?.name || id).join(', ')}</div>
                <div className="mt-2 flex gap-1">
                  <button onClick={() => toggleRoute(r)} className="px-2 py-1 rounded border text-xs bg-white">{r.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => removeRoute(r.id)} className="px-2 py-1 rounded border border-red-200 text-red-700 bg-white text-xs">Delete</button>
                </div>
              </div>
            ))}
            {routes.length === 0 ? <div className="text-sm text-gray-600">No routes</div> : null}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Silence Window List</h2>
          <div className="space-y-2">
            {silences.map((s) => (
              <div key={s.id} className="p-2 rounded border bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">{s.name}</div>
                  <span className={s.enabled ? 'text-[11px] px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200' : 'text-[11px] px-2 py-0.5 rounded border bg-gray-100 text-gray-700'}>{s.enabled ? 'ENABLED' : 'DISABLED'}</span>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">
                  {s.timezone} • {s.startTime}-{s.endTime} • days={(s.daysOfWeek || []).length ? (s.daysOfWeek || []).join(',') : 'ALL'}
                </div>
                <div className="text-[11px] text-gray-600">severity={s.severity || 'ALL'} • app={s.appId ? appLabel.get(s.appId) || s.appId : 'ALL'}</div>
                <div className="text-[11px] text-gray-600">instance={s.instanceId ? instanceLabel.get(s.instanceId) || s.instanceId : 'ALL'}</div>
                <div className="mt-2 flex gap-1">
                  <button onClick={() => toggleSilence(s)} className="px-2 py-1 rounded border text-xs bg-white">{s.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => removeSilence(s.id)} className="px-2 py-1 rounded border border-red-200 text-red-700 bg-white text-xs">Delete</button>
                </div>
              </div>
            ))}
            {silences.length === 0 ? <div className="text-sm text-gray-600">No silences</div> : null}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
