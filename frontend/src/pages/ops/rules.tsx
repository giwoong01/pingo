import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { opsApi, App, Instance, Rule, RulePreset, Webhook } from '@/features/ops/api/ops.api';
import { useRouter } from 'next/router';

export default function RulesPage() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobHints, setJobHints] = useState<any | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'APP' | 'INSTANCE'>('ALL');
  const [listAppFilter, setListAppFilter] = useState('');
  const [listInstanceFilter, setListInstanceFilter] = useState('');

  const [form, setForm] = useState({
    mode: 'PRESET' as 'PRESET' | 'ADVANCED',
    target: 'APP' as 'APP' | 'INSTANCE',
    appId: '',
    instanceId: '',
    presetId: 'heap_ratio_high',
    name: '',
    threshold: '',
    advancedExpr: '',
    advancedKind: 'CUSTOM',
    severity: 'MEDIUM',
    intervalSeconds: 60,
    forSeconds: 300,
    cooldownSeconds: 600,
    runbookUrl: '',
    runbookStepsText: '',
    webhookMode: 'ALL' as 'ALL' | 'SELECTED',
    webhookIds: [] as string[],
  });
  const [sloWizard, setSloWizard] = useState({
    fastThreshold: '14.4',
    slowThreshold: '6',
    fastSeverity: 'HIGH',
    slowSeverity: 'CRITICAL',
    runbookUrl: '',
    runbookStepsText: '최근 배포/인프라 변경 확인\n5xx 원인 엔드포인트 확인\nDB/외부 API 의존성 상태 확인',
  });

  const [editing, setEditing] = useState<Rule | null>(null);
  const [editWebhookMode, setEditWebhookMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [editWebhookIds, setEditWebhookIds] = useState<string[]>([]);
  const [editingExpr, setEditingExpr] = useState<Rule | null>(null);
  const [editExpr, setEditExpr] = useState('');
  const [editKind, setEditKind] = useState('CUSTOM');
  const [editingRunbook, setEditingRunbook] = useState<Rule | null>(null);
  const [editRunbookUrl, setEditRunbookUrl] = useState('');
  const [editRunbookSteps, setEditRunbookSteps] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const qScope = String(router.query.scope || '').toLowerCase();
    const qAppId = String(router.query.appId || '');
    const qInstanceId = String(router.query.instanceId || '');
    if (qScope === 'instance') setScopeFilter('INSTANCE');
    else if (qScope === 'app') setScopeFilter('APP');
    else setScopeFilter('ALL');
    if (qAppId) {
      setListAppFilter(qAppId);
      setForm((f) => ({ ...f, appId: qAppId }));
    }
    if (qInstanceId) {
      setListInstanceFilter(qInstanceId);
      setScopeFilter('INSTANCE');
      setForm((f) => ({ ...f, target: 'INSTANCE', instanceId: qInstanceId }));
    } else if (qScope === 'instance') {
      setForm((f) => ({ ...f, target: 'INSTANCE' }));
    } else if (qScope === 'app') {
      setForm((f) => ({ ...f, target: 'APP', instanceId: '' }));
    }
  }, [router.isReady, router.query.appId, router.query.instanceId, router.query.scope]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ruleFilter: { appId?: string; instanceId?: string } = {};
      if (scopeFilter === 'APP' && listAppFilter) ruleFilter.appId = listAppFilter;
      if (scopeFilter === 'INSTANCE' && listInstanceFilter) ruleFilter.instanceId = listInstanceFilter;
      const [a, i, r, p, w] = await Promise.all([
        opsApi.apps.list(),
        opsApi.instances.list(),
        opsApi.rules.listByScope(ruleFilter),
        opsApi.presets.listRulePresets(),
        opsApi.webhooks.list(),
      ]);
      const filteredRules =
        scopeFilter === 'APP'
          ? r.filter((x) => !x.instanceId)
          : scopeFilter === 'INSTANCE'
          ? r.filter((x) => Boolean(x.instanceId))
          : r;
      setApps(a);
      setInstances(i);
      setRules(filteredRules);
      setPresets(p);
      setWebhooks(w);
      if (!form.appId && a[0]?.id) setForm((f) => ({ ...f, appId: a[0].id }));
      const scopedInstance = i.find((x) => x.id === form.instanceId);
      if (scopedInstance?.appId && form.appId !== scopedInstance.appId) {
        setForm((f) => ({ ...f, appId: scopedInstance.appId || f.appId }));
      }
      setForm((f) => {
        if (w.length === 0) return { ...f, webhookMode: 'ALL', webhookIds: [] };
        if (f.webhookMode !== 'SELECTED') return f;
        if (f.webhookIds.length > 0) return f;
        const enabledIds = w.filter((x) => x.enabled).map((x) => x.id);
        return { ...f, webhookIds: enabledIds };
      });
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [form.appId, form.instanceId, listAppFilter, listInstanceFilter, scopeFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const appById = useMemo(() => {
    const m = new Map<string, App>();
    apps.forEach((a) => m.set(a.id, a));
    return m;
  }, [apps]);

  const presetById = useMemo(() => {
    const m = new Map<string, RulePreset>();
    presets.forEach((p) => m.set(p.id, p));
    return m;
  }, [presets]);

  useEffect(() => {
    const loadHints = async () => {
      const app = appById.get(form.appId);
      if (!app) return;
      try {
        const hints = await opsApi.clusters.jobHints(app.clusterId);
        setJobHints(hints);
      } catch {
        setJobHints(null);
      }
    };
    loadHints();
  }, [form.appId, appById]);

  const onPresetChange = (presetId: string) => {
    const p = presetById.get(presetId);
    setForm((f) => ({
      ...f,
      threshold: p?.defaultThreshold ?? '',
      intervalSeconds: p?.defaultIntervalSeconds ?? f.intervalSeconds,
      forSeconds: p?.defaultForSeconds ?? f.forSeconds,
      cooldownSeconds: p?.defaultCooldownSeconds ?? f.cooldownSeconds,
    }));
  };

  const createRule = async () => {
    setError(null);
    try {
      const isInstanceTarget = form.target === 'INSTANCE';
      if (!isInstanceTarget && !form.appId) {
        setError('App only 룰에서는 App을 선택해야 합니다.');
        return;
      }
      if (isInstanceTarget && !form.instanceId) {
        setError('Instance only 룰에서는 인스턴스를 선택해야 합니다.');
        return;
      }
      const selectedInstance = isInstanceTarget ? instanceById.get(form.instanceId) : null;
      const targetAppId = isInstanceTarget ? selectedInstance?.appId || undefined : form.appId || undefined;
      const targetInstanceId = isInstanceTarget ? form.instanceId : '';
      const runbookSteps = String(form.runbookStepsText || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      const webhookMode = webhooks.length === 0 ? 'ALL' : form.webhookMode;
      if (form.mode === 'PRESET') {
        await opsApi.rules.createFromPreset({
          appId: targetAppId,
          instanceId: targetInstanceId || undefined,
          presetId: form.presetId,
          name: form.name || `${presetById.get(form.presetId)?.name || form.presetId}`,
          threshold: form.threshold || undefined,
          severity: form.severity,
          intervalSeconds: Number(form.intervalSeconds),
          forSeconds: Number(form.forSeconds),
          cooldownSeconds: Number(form.cooldownSeconds),
          runbookUrl: String(form.runbookUrl || '').trim() || undefined,
          runbookSteps: runbookSteps.length > 0 ? runbookSteps : undefined,
          webhookIds: webhookMode === 'SELECTED' ? form.webhookIds : undefined,
        });
      } else {
        const expr = String(form.advancedExpr || '').trim();
        if (!expr) {
          setError('Advanced Expr 모드에서는 expr(PromQL)를 입력해야 합니다.');
          return;
        }
        await opsApi.rules.create({
          appId: targetAppId,
          instanceId: targetInstanceId || undefined,
          name: form.name || `Advanced rule (${form.advancedKind})`,
          severity: form.severity,
          kind: form.advancedKind || 'CUSTOM',
          intervalSeconds: Number(form.intervalSeconds),
          forSeconds: Number(form.forSeconds),
          cooldownSeconds: Number(form.cooldownSeconds),
          runbookUrl: String(form.runbookUrl || '').trim() || undefined,
          runbookSteps: runbookSteps.length > 0 ? runbookSteps : undefined,
          webhookIds: webhookMode === 'SELECTED' ? form.webhookIds : undefined,
        });
      }
      setForm((f) => ({ ...f, name: '' }));
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const createSloPair = async () => {
    if (form.target === 'APP' && !form.appId) {
      setError('App을 먼저 선택하세요.');
      return;
    }
    if (form.target === 'INSTANCE' && !form.instanceId) {
      setError('Instance only 룰에서는 인스턴스를 선택해야 합니다.');
      return;
    }
    setError(null);
    try {
      const selectedInstance = form.target === 'INSTANCE' ? instanceById.get(form.instanceId) : null;
      const targetAppId = form.target === 'INSTANCE' ? selectedInstance?.appId || undefined : form.appId || undefined;
      if (!targetAppId) {
        setError('SLO 프리셋은 app(job) 컨텍스트가 필요합니다. 앱 연결된 인스턴스를 선택하세요.');
        return;
      }
      const targetInstanceId = form.target === 'INSTANCE' ? form.instanceId : '';
      const webhookMode = webhooks.length === 0 ? 'ALL' : form.webhookMode;
      const runbookSteps = String(sloWizard.runbookStepsText || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      const app = targetAppId ? appById.get(targetAppId) : undefined;
      const appName = app?.name || targetAppId;
      await opsApi.rules.createFromPreset({
        appId: targetAppId,
        instanceId: targetInstanceId || undefined,
        presetId: 'slo_burn_rate_fast_5m',
        name: `[SLO Fast] ${appName}`,
        threshold: sloWizard.fastThreshold || '14.4',
        severity: sloWizard.fastSeverity,
        intervalSeconds: 30,
        forSeconds: 120,
        cooldownSeconds: 600,
        runbookUrl: String(sloWizard.runbookUrl || '').trim() || undefined,
        runbookSteps: runbookSteps.length > 0 ? runbookSteps : undefined,
        webhookIds: webhookMode === 'SELECTED' ? form.webhookIds : undefined,
      });
      await opsApi.rules.createFromPreset({
        appId: targetAppId,
        instanceId: targetInstanceId || undefined,
        presetId: 'slo_burn_rate_slow_30m',
        name: `[SLO Slow] ${appName}`,
        threshold: sloWizard.slowThreshold || '6',
        severity: sloWizard.slowSeverity,
        intervalSeconds: 60,
        forSeconds: 300,
        cooldownSeconds: 900,
        runbookUrl: String(sloWizard.runbookUrl || '').trim() || undefined,
        runbookSteps: runbookSteps.length > 0 ? runbookSteps : undefined,
        webhookIds: webhookMode === 'SELECTED' ? form.webhookIds : undefined,
      });
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const createQuickPreset = async (presetId: string, severity?: string) => {
    if (form.target === 'APP' && !form.appId) {
      setError('App을 먼저 선택하세요.');
      return;
    }
    if (form.target === 'INSTANCE' && !form.instanceId) {
      setError('Instance only 룰에서는 인스턴스를 선택해야 합니다.');
      return;
    }
    setError(null);
    try {
      const preset = presetById.get(presetId);
      if (!preset) {
        setError(`Preset not found: ${presetId}`);
        return;
      }
      const selectedInstance = form.target === 'INSTANCE' ? instanceById.get(form.instanceId) : null;
      const targetAppId = form.target === 'INSTANCE' ? selectedInstance?.appId || undefined : form.appId || undefined;
      const webhookMode = webhooks.length === 0 ? 'ALL' : form.webhookMode;
      const app = targetAppId ? appById.get(targetAppId) : undefined;
      const appName = app?.name || selectedInstance?.name || form.instanceId;
      const targetInstanceId = form.target === 'INSTANCE' ? form.instanceId : '';
      const instanceName = targetInstanceId ? instanceById.get(targetInstanceId)?.name || targetInstanceId : 'all';
      await opsApi.rules.createFromPreset({
        appId: targetAppId,
        instanceId: targetInstanceId || undefined,
        name: `[Quick] ${preset.name} - ${appName} (${instanceName})`,
        threshold: preset.defaultThreshold || undefined,
        severity: severity || form.severity,
        intervalSeconds: preset.defaultIntervalSeconds,
        forSeconds: preset.defaultForSeconds,
        cooldownSeconds: preset.defaultCooldownSeconds,
        webhookIds: webhookMode === 'SELECTED' ? form.webhookIds : undefined,
      });
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const test = async (id: string) => {
    setError(null);
    try {
      const r = await opsApi.rules.test(id);
      alert(`ok=${r.ok} firing=${r.firing} value=${r.value}\n${r.expr}`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete rule?')) return;
    setError(null);
    try {
      await opsApi.rules.remove(id);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const toggleEnabled = async (r: Rule) => {
    setError(null);
    try {
      await opsApi.rules.update(r.id, { enabled: !r.enabled });
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const openEditWebhooks = (r: Rule) => {
    setEditing(r);
    const mode = r.webhookMode === 'SELECTED' ? 'SELECTED' : 'ALL';
    setEditWebhookMode(mode);
    setEditWebhookIds(Array.isArray(r.webhookIds) ? r.webhookIds : []);
  };

  const openEditExpr = (r: Rule) => {
    setEditingExpr(r);
    setEditExpr(String(r.expr || ''));
    setEditKind(String(r.kind || 'CUSTOM'));
  };

  const openEditRunbook = (r: Rule) => {
    setEditingRunbook(r);
    setEditRunbookUrl(String(r.runbook?.url || ''));
    setEditRunbookSteps(Array.isArray(r.runbook?.steps) ? r.runbook.steps.join('\n') : '');
  };

  const saveEditWebhooks = async () => {
    if (!editing) return;
    setError(null);
    try {
      await opsApi.rules.update(editing.id, {
        webhookMode: editWebhookMode,
        webhookIds: editWebhookMode === 'SELECTED' ? editWebhookIds : undefined,
      });
      setEditing(null);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const saveEditExpr = async () => {
    if (!editingExpr) return;
    const expr = String(editExpr || '').trim();
    if (!expr) {
      setError('expr를 입력하세요.');
      return;
    }
    setError(null);
    try {
      await opsApi.rules.update(editingExpr.id, {
        kind: editKind || 'CUSTOM',
      });
      setEditingExpr(null);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const saveEditRunbook = async () => {
    if (!editingRunbook) return;
    setError(null);
    try {
      const steps = String(editRunbookSteps || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      await opsApi.rules.update(editingRunbook.id, {
        runbookUrl: String(editRunbookUrl || '').trim() || '',
        runbookSteps: steps,
      });
      setEditingRunbook(null);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const selectedApp = appById.get(form.appId);
  const instanceById = useMemo(() => {
    const m = new Map<string, Instance>();
    instances.forEach((i) => m.set(i.id, i));
    return m;
  }, [instances]);
  const selectedPreset = presetById.get(form.presetId);
  const presetsForTarget = useMemo(() => {
    if (form.target === 'INSTANCE') {
      return presets.filter((p) => !String(p.exprTemplate || '').includes('${job}'));
    }
    return presets.filter((p) => !String(p.id || '').startsWith('instance_'));
  }, [form.target, presets]);
  const quickAppPresets = [
    { id: 'http_5xx_ratio_high', label: '5xx ratio', severity: 'HIGH' },
    { id: 'http_latency_p95_high', label: 'p95 latency', severity: 'HIGH' },
    { id: 'http_latency_p99_high', label: 'p99 latency', severity: 'HIGH' },
    { id: 'heap_ratio_high', label: 'heap ratio', severity: 'MEDIUM' },
    { id: 'gc_pause_avg_high', label: 'GC pause', severity: 'MEDIUM' },
  ];
  const quickInstancePresets = [
    { id: 'instance_memory_usage_high', label: 'instance memory', severity: 'HIGH' },
    { id: 'instance_load1_high', label: 'instance load1', severity: 'HIGH' },
    { id: 'instance_swap_usage_high', label: 'instance swap', severity: 'MEDIUM' },
  ];
  const effectiveKind = form.mode === 'PRESET' ? selectedPreset?.kind : form.advancedKind;
  const needsJvm = effectiveKind === 'HEAP_RATIO_HIGH' || effectiveKind === 'GC_PAUSE_AVG_HIGH';
  const needsHttp =
    effectiveKind === 'HTTP_5XX_RATIO_HIGH' ||
    effectiveKind === 'HTTP_LATENCY_P95_HIGH' ||
    effectiveKind === 'HTTP_RPS_DROP' ||
    effectiveKind === 'SLO_BURN_RATE_HIGH';
  const job = selectedApp?.job || '';
  const jvmOk = !needsJvm || (Array.isArray(jobHints?.jvmJobs) && jobHints.jvmJobs.includes(job));
  const httpOk = !needsHttp || (Array.isArray(jobHints?.httpJobs) && jobHints.httpJobs.includes(job));
  const upNow = Array.isArray(jobHints?.upJobs) ? jobHints.upJobs.includes(job) : true;

  const webhookById = useMemo(() => {
    const m = new Map<string, Webhook>();
    webhooks.forEach((w) => m.set(w.id, w));
    return m;
  }, [webhooks]);

  useEffect(() => {
    if (!presetsForTarget.length) return;
    if (!presetsForTarget.some((p) => p.id === form.presetId)) {
      setForm((f) => ({ ...f, presetId: presetsForTarget[0].id }));
    }
  }, [form.presetId, presetsForTarget]);

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rules</h1>
          <p className="text-gray-600 mt-1">프리셋 기반으로 룰을 만들고, 필요하면 PromQL을 직접 편집합니다(Advanced).</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 p-4 rounded-xl border bg-white">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-600">Scope</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setScopeFilter('ALL')}
                className={scopeFilter === 'ALL' ? 'px-3 py-1.5 rounded border bg-blue-600 text-white text-xs' : 'px-3 py-1.5 rounded border bg-white text-xs'}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('APP')}
                className={scopeFilter === 'APP' ? 'px-3 py-1.5 rounded border bg-blue-600 text-white text-xs' : 'px-3 py-1.5 rounded border bg-white text-xs'}
              >
                APP
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('INSTANCE')}
                className={scopeFilter === 'INSTANCE' ? 'px-3 py-1.5 rounded border bg-blue-600 text-white text-xs' : 'px-3 py-1.5 rounded border bg-white text-xs'}
              >
                INSTANCE
              </button>
            </div>
          </div>

          {scopeFilter === 'APP' ? (
            <div>
              <label className="text-xs text-gray-600">App Filter</label>
              <select
                className="block mt-1 px-3 py-2 border rounded-lg text-sm"
                value={listAppFilter}
                onChange={(e) => setListAppFilter(e.target.value)}
              >
                <option value="">All apps</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.job})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {scopeFilter === 'INSTANCE' ? (
            <div>
              <label className="text-xs text-gray-600">Instance Filter</label>
              <select
                className="block mt-1 px-3 py-2 border rounded-lg text-sm"
                value={listInstanceFilter}
                onChange={(e) => setListInstanceFilter(e.target.value)}
              >
                <option value="">All instances</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.prometheusInstance})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Create Rule</h2>
          <label className="text-xs text-gray-600">Rule Target</label>
          <div className="mt-1 mb-3 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.target === 'APP'}
                onChange={() => setForm((f) => ({ ...f, target: 'APP', instanceId: '' }))}
              />
              <span>App only</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.target === 'INSTANCE'}
                onChange={() => setForm((f) => ({ ...f, target: 'INSTANCE' }))}
              />
              <span>Instance only</span>
            </label>
          </div>
          {form.target === 'APP' ? (
            <>
              <label className="text-xs text-gray-600">App</label>
              <select
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.appId}
                onChange={(e) => setForm({ ...form, appId: e.target.value, instanceId: '' })}
              >
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.job})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="text-xs text-gray-600">Instance</label>
              <select
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.instanceId}
                onChange={(e) => {
                  const iid = e.target.value;
                  const inst = instances.find((x) => x.id === iid);
                  setForm((f) => ({ ...f, instanceId: iid, appId: inst?.appId || '' }));
                }}
              >
                <option value="">Select instance</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.prometheusInstance}) {i.appId ? `• app:${appById.get(i.appId)?.name || i.appId}` : ''}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500 -mt-2 mb-2">
                App 미연결 인스턴스도 선택할 수 있습니다. (일부 app 기반 프리셋은 제한될 수 있음)
              </div>
              <div className="text-xs text-gray-600 mb-3">
                대상 App: {form.instanceId ? appById.get(instanceById.get(form.instanceId)?.appId || '')?.name || '-' : '-'}
              </div>
            </>
          )}
          {form.target === 'APP' ? <div className="text-xs text-gray-600 mb-3">App only 룰은 선택한 App 전체 인스턴스에 적용됩니다.</div> : null}

          <div className="mb-4 p-3 rounded-lg border bg-emerald-50 border-emerald-200">
            <div className="font-semibold text-emerald-900 text-sm">Quick 1-Click Presets</div>
            <div className="text-xs text-emerald-900 mt-1">
              {form.target === 'APP'
                ? '선택한 app 전체 기준으로 즉시 룰을 생성합니다.'
                : '선택한 단일 instance 기준으로 즉시 룰을 생성합니다.'}
            </div>
            {form.target === 'APP' ? (
              <div className="mt-3">
                <div className="text-[11px] text-emerald-800 mb-1">App</div>
                <div className="flex flex-wrap gap-2">
                  {quickAppPresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => createQuickPreset(p.id, p.severity)}
                      className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50"
                      disabled={form.webhookMode === 'SELECTED' && webhooks.length > 0 && form.webhookIds.length === 0}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-[11px] text-emerald-800 mb-1">Instance</div>
                <div className="flex flex-wrap gap-2">
                  {quickInstancePresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => createQuickPreset(p.id, p.severity)}
                      className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50"
                      disabled={
                        !form.instanceId || (form.webhookMode === 'SELECTED' && webhooks.length > 0 && form.webhookIds.length === 0)
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {form.target === 'APP' ? (
            <div className="mb-4 p-3 rounded-lg border bg-blue-50 border-blue-200">
              <div className="font-semibold text-blue-900 text-sm">SLO Wizard (Fast + Slow)</div>
              <div className="text-xs text-blue-900 mt-1">5m/30m burn-rate 룰 2개를 한 번에 생성합니다.</div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="text-xs text-blue-900">Fast threshold</label>
                <input
                  className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white"
                  value={sloWizard.fastThreshold}
                  onChange={(e) => setSloWizard((s) => ({ ...s, fastThreshold: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-blue-900">Slow threshold</label>
                <input
                  className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white"
                  value={sloWizard.slowThreshold}
                  onChange={(e) => setSloWizard((s) => ({ ...s, slowThreshold: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-blue-900">Fast severity</label>
                <select
                  className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white"
                  value={sloWizard.fastSeverity}
                  onChange={(e) => setSloWizard((s) => ({ ...s, fastSeverity: e.target.value }))}
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-blue-900">Slow severity</label>
                <select
                  className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white"
                  value={sloWizard.slowSeverity}
                  onChange={(e) => setSloWizard((s) => ({ ...s, slowSeverity: e.target.value }))}
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="text-xs text-blue-900 mt-3 block">Runbook URL (optional)</label>
            <input
              className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white"
              value={sloWizard.runbookUrl}
              onChange={(e) => setSloWizard((s) => ({ ...s, runbookUrl: e.target.value }))}
              placeholder="https://wiki.company.com/runbooks/http-errors"
            />
            <label className="text-xs text-blue-900 mt-3 block">Runbook Steps (one per line)</label>
            <textarea
              className="w-full mt-1 px-2 py-1.5 border rounded-lg bg-white text-xs"
              rows={3}
              value={sloWizard.runbookStepsText}
              onChange={(e) => setSloWizard((s) => ({ ...s, runbookStepsText: e.target.value }))}
            />
              <button
                type="button"
                onClick={createSloPair}
                className="mt-3 w-full px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
                disabled={form.webhookMode === 'SELECTED' && webhooks.length > 0 && form.webhookIds.length === 0}
              >
                Create SLO Pair Rules
              </button>
            </div>
          ) : null}

          <label className="text-xs text-gray-600">Mode</label>
          <div className="mt-1 mb-3 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'PRESET'} onChange={() => setForm((f) => ({ ...f, mode: 'PRESET' }))} />
              <span>Preset</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'ADVANCED'} onChange={() => setForm((f) => ({ ...f, mode: 'ADVANCED' }))} />
              <span>Advanced Expr</span>
            </label>
          </div>

          {form.mode === 'PRESET' ? (
            <>
              <label className="text-xs text-gray-600">Preset</label>
              <select
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.presetId}
                onChange={(e) => onPresetChange(e.target.value)}
              >
                {presetsForTarget.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mb-3">{presetById.get(form.presetId)?.description}</div>
            </>
          ) : (
            <div className="mb-3 p-3 rounded-lg border bg-gray-50">
              <label className="text-xs text-gray-600">Kind</label>
              <select
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg bg-white"
                value={form.advancedKind}
                onChange={(e) => setForm((f) => ({ ...f, advancedKind: e.target.value }))}
              >
                <option value="CUSTOM">CUSTOM</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.kind}>
                    {p.kind}
                  </option>
                ))}
              </select>

              <label className="text-xs text-gray-600">Expr (PromQL)</label>
              <textarea
                className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-xs"
                rows={5}
                value={form.advancedExpr}
                onChange={(e) => setForm((f) => ({ ...f, advancedExpr: e.target.value }))}
                placeholder={'sum(rate(http_server_requests_seconds_count{job="${job}",status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"}[5m])), 1) > 0.05'}
              />
              <div className="mt-2 text-xs text-gray-600">`${'{job}'}` 플레이스홀더를 사용할 수 있습니다.</div>
            </div>
          )}

          {selectedApp && effectiveKind && (!jvmOk || !httpOk) && (
            <div className="mb-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-900 text-sm">
              이 프리셋은 현재 선택된 job(<code>{job}</code>)에서 필요한 메트릭이 없어서 <b>절대 firing 되지 않을 수 있습니다</b>.
              <div className="text-xs text-yellow-800 mt-1">
                {needsJvm && !jvmOk ? 'JVM 메트릭 없음(jvm_memory_*) ' : ''}
                {needsHttp && !httpOk ? 'HTTP 메트릭 없음(http_server_requests_*) ' : ''}
              </div>
              <div className="text-xs text-yellow-800 mt-1">Apps에서 해당 타입(JVM/HTTP)으로 job 추천을 받아 교체하세요.</div>
            </div>
          )}
          {selectedApp && effectiveKind && !upNow && (
            <div className="mb-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 text-sm">
              현재 job(<code>{job}</code>)은 Prometheus 기준 <b>DOWN</b> 상태입니다 (up=0).
            </div>
          )}

          <label className="text-xs text-gray-600">Name</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="(optional)"
          />

          <label className="text-xs text-gray-600">Severity</label>
          <select
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
          >
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {form.mode === 'PRESET' ? (
            <>
              <label className="text-xs text-gray-600">Threshold</label>
              <input
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder={presetById.get(form.presetId)?.defaultThreshold || ''}
              />
              {String(form.presetId).startsWith('slo_burn_rate_') ? (
                <div className="text-xs text-gray-600 -mt-2 mb-3">
                  SLO Burn Rate 프리셋에서 Threshold는 배수(x)입니다. 예: 14.4 = 에러버짓 14.4배 속도로 소진.
                </div>
              ) : null}
            </>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-600">Interval(s)</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                value={form.intervalSeconds}
                onChange={(e) => setForm({ ...form, intervalSeconds: Number(e.target.value) })}
                type="number"
                min={5}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">For(s)</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                value={form.forSeconds}
                onChange={(e) => setForm({ ...form, forSeconds: Number(e.target.value) })}
                type="number"
                min={0}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Cooldown(s)</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                value={form.cooldownSeconds}
                onChange={(e) => setForm({ ...form, cooldownSeconds: Number(e.target.value) })}
                type="number"
                min={0}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs text-gray-600">Runbook URL (optional)</label>
            <input
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              value={form.runbookUrl}
              onChange={(e) => setForm({ ...form, runbookUrl: e.target.value })}
              placeholder="https://wiki.company.com/runbooks/..."
            />
            <label className="text-xs text-gray-600 mt-3 block">Runbook Steps (one per line)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
              rows={3}
              value={form.runbookStepsText}
              onChange={(e) => setForm({ ...form, runbookStepsText: e.target.value })}
              placeholder={'1) 최근 배포 이력 확인\n2) 5xx endpoint 상위 3개 확인\n3) DB pool 상태 확인'}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs text-gray-600">Discord Webhooks</label>
            {webhooks.length === 0 ? (
              <div className="mt-2 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-900 text-sm">
                등록된 웹훅이 없습니다. <code>Ops &gt; Webhooks</code>에서 Discord Webhook URL을 먼저 추가하세요.
              </div>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="webhookMode"
                      checked={form.webhookMode === 'ALL'}
                      onChange={() => setForm((f) => ({ ...f, webhookMode: 'ALL' }))}
                    />
                    <span>All enabled</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="webhookMode"
                      checked={form.webhookMode === 'SELECTED'}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          webhookMode: 'SELECTED',
                          webhookIds: f.webhookIds.length ? f.webhookIds : webhooks.filter((w) => w.enabled).map((w) => w.id),
                        }))
                      }
                    />
                    <span>Selected</span>
                  </label>
                </div>

                {form.webhookMode === 'SELECTED' ? (
                  <div className="mt-3 p-3 rounded-lg border bg-gray-50">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs text-gray-600">선택한 웹훅으로만 알림을 보냅니다.</div>
                      <button
                        type="button"
                        className="text-xs underline text-gray-700"
                        onClick={() => setForm((f) => ({ ...f, webhookIds: webhooks.filter((w) => w.enabled).map((w) => w.id) }))}
                      >
                        Select All Enabled
                      </button>
                    </div>
                    <div className="space-y-2">
                      {webhooks.map((w) => (
                        <label key={w.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={form.webhookIds.includes(w.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setForm((f) => {
                                  const next = new Set(f.webhookIds);
                                  if (checked) next.add(w.id);
                                  else next.delete(w.id);
                                  return { ...f, webhookIds: Array.from(next) };
                                });
                              }}
                            />
                            <span className="text-gray-900">{w.name}</span>
                          </div>
                          <span className={['text-xs', w.enabled ? 'text-emerald-700' : 'text-gray-500'].join(' ')}>
                            {w.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </label>
                      ))}
                    </div>
                    {form.webhookIds.length === 0 ? (
                      <div className="text-xs text-red-700 mt-2">Selected 모드에서는 최소 1개 웹훅을 선택해야 합니다.</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 mt-2">모든 enabled 웹훅으로 알림을 보냅니다.</div>
                )}
              </>
            )}
          </div>

          <button
            onClick={createRule}
            className="w-full mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
            disabled={
              (form.webhookMode === 'SELECTED' && webhooks.length > 0 && form.webhookIds.length === 0) ||
              (form.mode === 'ADVANCED' && !String(form.advancedExpr || '').trim())
            }
          >
            {form.mode === 'PRESET' ? 'Create Rule (Preset)' : 'Create Rule (Advanced)'}
          </button>

          <div className="mt-5 p-4 rounded-lg bg-gray-50 border text-sm text-gray-700">
            <div className="font-semibold text-gray-900 mb-2">튜토리얼: 예시 입력</div>
            <pre className="text-xs whitespace-pre-wrap">
{`App: Billing API (billing-prod)
Preset: JVM Heap Usage Ratio High
Severity: MEDIUM
Threshold: 0.8
Interval(s): 60
For(s): 300
Cooldown(s): 600
Discord Webhooks: Selected -> #oncall, #ops-alerts`}
            </pre>
            <div className="text-xs text-gray-600 mt-2">
              Advanced Expr 모드에서는 PromQL을 직접 입력해 룰을 생성할 수 있습니다.
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">List</h2>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-gray-600">No rules</div>
          ) : (
            <div className="divide-y">
              {rules.map((r) => {
                const a = r.appId ? appById.get(r.appId) : undefined;
                const mode = r.webhookMode === 'SELECTED' ? 'SELECTED' : 'ALL';
                const names =
                  mode === 'ALL'
                    ? 'ALL enabled webhooks'
                    : (r.webhookIds || [])
                        .map((id) => webhookById.get(id)?.name || id)
                        .slice(0, 4)
                        .join(', ') + ((r.webhookIds || []).length > 4 ? '…' : '');
                return (
                  <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        [{r.severity}] {r.name}
                        <span
                          className={[
                            'ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]',
                            r.enabled
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 bg-gray-50 text-gray-700',
                          ].join(' ')}
                        >
                          {r.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 truncate">
                        app={a ? `${a.name} (${a.job})` : r.appId || '(unlinked)'} • every {r.intervalSeconds}s • for {r.forSeconds}s
                      </div>
                      <div className="text-xs text-gray-600 truncate mt-1">
                        scope=
                        {r.instanceId
                          ? `instance ${instanceById.get(r.instanceId)?.prometheusInstance || r.instanceId}`
                          : 'all instances'}
                      </div>
                      <div className="text-xs text-gray-600 truncate mt-1">webhooks={names || '-'}</div>
                      <div className="text-xs text-gray-600 truncate mt-1">
                        runbook={r.runbook?.url ? 'url' : '-'} • steps={Array.isArray(r.runbook?.steps) ? r.runbook?.steps?.length : 0}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-1">{r.expr}</div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openEditExpr(r)}
                        className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                      >
                        Edit Expr
                      </button>
                      <button
                        onClick={() => openEditWebhooks(r)}
                        className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                      >
                        Webhooks
                      </button>
                      <button
                        onClick={() => openEditRunbook(r)}
                        className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                      >
                        Runbook
                      </button>
                      <button
                        onClick={() => test(r.id)}
                        className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => toggleEnabled(r)}
                        className={[
                          'px-3 py-1.5 rounded-lg border text-xs',
                          r.enabled
                            ? 'border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
                        ].join(' ')}
                      >
                        {r.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl rounded-2xl bg-white border shadow-lg p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs text-gray-500">Edit Webhooks</div>
                <div className="font-semibold text-gray-900 mt-1">{editing.name}</div>
              </div>
              <button className="text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            <div className="flex items-center gap-3 text-sm mb-3">
              <label className="flex items-center gap-2">
                <input type="radio" checked={editWebhookMode === 'ALL'} onChange={() => setEditWebhookMode('ALL')} />
                <span>All enabled</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={editWebhookMode === 'SELECTED'} onChange={() => setEditWebhookMode('SELECTED')} />
                <span>Selected</span>
              </label>
            </div>

            {editWebhookMode === 'SELECTED' ? (
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs text-gray-600">선택한 웹훅으로만 알림이 전송됩니다.</div>
                  <button
                    type="button"
                    className="text-xs underline text-gray-700"
                    onClick={() => setEditWebhookIds(webhooks.filter((w) => w.enabled).map((w) => w.id))}
                  >
                    Select All Enabled
                  </button>
                </div>
                <div className="space-y-2">
                  {webhooks.map((w) => (
                    <label key={w.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editWebhookIds.includes(w.id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditWebhookIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(w.id);
                              else next.delete(w.id);
                              return Array.from(next);
                            });
                          }}
                        />
                        <span className="text-gray-900">{w.name}</span>
                      </div>
                      <span className={['text-xs', w.enabled ? 'text-emerald-700' : 'text-gray-500'].join(' ')}>
                        {w.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </label>
                  ))}
                </div>
                {editWebhookIds.length === 0 ? <div className="text-xs text-red-700 mt-2">최소 1개를 선택하세요.</div> : null}
              </div>
            ) : (
              <div className="text-xs text-gray-600 mb-3">모든 enabled 웹훅으로 알림이 전송됩니다.</div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
                onClick={saveEditWebhooks}
                disabled={editWebhookMode === 'SELECTED' && editWebhookIds.length === 0}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRunbook && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded-2xl bg-white border shadow-lg p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs text-gray-500">Edit Runbook</div>
                <div className="font-semibold text-gray-900 mt-1">{editingRunbook.name}</div>
              </div>
              <button className="text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setEditingRunbook(null)}>
                Close
              </button>
            </div>

            <label className="text-xs text-gray-600">Runbook URL</label>
            <input
              className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
              value={editRunbookUrl}
              onChange={(e) => setEditRunbookUrl(e.target.value)}
              placeholder="https://wiki.company.com/runbooks/..."
            />
            <label className="text-xs text-gray-600">Runbook Steps (one per line)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
              rows={6}
              value={editRunbookSteps}
              onChange={(e) => setEditRunbookSteps(e.target.value)}
              placeholder={'1) 최근 배포 확인\n2) 로그 에러 상위 패턴 확인\n3) 의존성 상태 점검'}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" onClick={() => setEditingRunbook(null)}>
                Cancel
              </button>
              <button className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm" onClick={saveEditRunbook}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingExpr && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded-2xl bg-white border shadow-lg p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-xs text-gray-500">Edit Expr</div>
                <div className="font-semibold text-gray-900 mt-1">{editingExpr.name}</div>
              </div>
              <button className="text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50" onClick={() => setEditingExpr(null)}>
                Close
              </button>
            </div>

            <label className="text-xs text-gray-600">Kind</label>
            <select
              className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
              value={editKind}
              onChange={(e) => setEditKind(e.target.value)}
            >
              <option value="CUSTOM">CUSTOM</option>
              {presets.map((p) => (
                <option key={p.id} value={p.kind}>
                  {p.kind}
                </option>
              ))}
            </select>

            <label className="text-xs text-gray-600">Expr (PromQL)</label>
            <textarea
              className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-xs"
              rows={7}
              value={editExpr}
              onChange={(e) => setEditExpr(e.target.value)}
              placeholder='sum(rate(http_server_requests_seconds_count{job="${job}"}[5m])) > 10'
            />
            <div className="text-xs text-gray-600 mt-2">`${'{job}'}` 플레이스홀더를 사용할 수 있습니다.</div>

            <div className="flex justify-end gap-2 mt-4">
              <button className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" onClick={() => setEditingExpr(null)}>
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
                onClick={saveEditExpr}
                disabled={!String(editExpr || '').trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
