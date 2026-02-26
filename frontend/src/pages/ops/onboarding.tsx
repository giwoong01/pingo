import React from 'react';
import Link from 'next/link';
import MainLayout from '@/layouts/MainLayout';
import { App, Instance, Rule, opsApi } from '@/features/ops/api/ops.api';

type StepItem = {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  href: string;
};

type VerifyState = {
  status: 'idle' | 'running' | 'pass' | 'fail';
  message: string;
};

type RulePack = {
  id: 'app_incident' | 'app_perf' | 'instance_guard';
  title: string;
  desc: string;
  presetIds: string[];
};

const RULE_PACKS: RulePack[] = [
  {
    id: 'app_incident',
    title: '앱 장애 대응 Pack',
    desc: 'DOWN/5xx/지연 급등을 빠르게 감지합니다.',
    presetIds: ['instance_down', 'http_5xx_ratio_high', 'http_latency_p95_high'],
  },
  {
    id: 'app_perf',
    title: '앱 성능/리소스 Pack',
    desc: 'CPU/Heap/GC 이상을 함께 감시합니다.',
    presetIds: ['cpu_cores_high', 'heap_ratio_high', 'gc_pause_avg_high'],
  },
  {
    id: 'instance_guard',
    title: '인스턴스 보호 Pack',
    desc: '메모리/스왑/로드 이상을 인스턴스 단위로 감시합니다.',
    presetIds: ['instance_memory_usage_high', 'instance_swap_usage_high', 'instance_load1_high'],
  },
];

function HelpTip({ title, body }: { title: string; body: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] text-gray-600 bg-white hover:bg-gray-50"
        aria-label={`${title} help`}
      >
        ?
      </button>
      <span
        className={[
          'pointer-events-none absolute z-20 w-72 max-w-[80vw]',
          'top-5 left-0',
          'opacity-0 scale-95 translate-y-1',
          'group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0',
          'transition duration-150 ease-out',
          'rounded-xl border bg-white shadow-lg p-3',
          'text-xs text-gray-800 whitespace-pre-line',
        ].join(' ')}
      >
        <span className="font-semibold text-gray-900">{title}</span>
        <span className="block mt-2">{body}</span>
      </span>
    </span>
  );
}

export default function OpsOnboardingPage() {
  const [clusters, setClusters] = React.useState<any[]>([]);
  const [apps, setApps] = React.useState<App[]>([]);
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [widgetReady, setWidgetReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [runningPackId, setRunningPackId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedAppId, setSelectedAppId] = React.useState('');
  const [selectedInstanceId, setSelectedInstanceId] = React.useState('');
  const [creating, setCreating] = React.useState<null | 'cluster' | 'app' | 'instance'>(null);
  const [clusterForm, setClusterForm] = React.useState({
    name: '',
    prometheusUrl: 'http://localhost:9090/api/v1/query',
    bearerToken: '',
  });
  const [appForm, setAppForm] = React.useState({
    clusterId: '',
    name: '',
    owner: '',
    job: '',
  });
  const [instanceForm, setInstanceForm] = React.useState({
    clusterId: '',
    appId: '',
    name: '',
    provider: 'oracle',
    publicIp: '',
    prometheusInstance: '',
  });
  const [instanceHints, setInstanceHints] = React.useState<string[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [verifyCluster, setVerifyCluster] = React.useState<VerifyState>({ status: 'idle', message: '' });
  const [verifyApp, setVerifyApp] = React.useState<VerifyState>({ status: 'idle', message: '' });
  const [verifyInstance, setVerifyInstance] = React.useState<VerifyState>({ status: 'idle', message: '' });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a, i, r] = await Promise.all([
        opsApi.clusters.list(),
        opsApi.apps.list(),
        opsApi.instances.list(),
        opsApi.rules.list(),
      ]);
      setClusters(c || []);
      setApps(a || []);
      setInstances(i || []);
      setRules(r || []);

      const appId = (a || [])[0]?.id ? String((a || [])[0].id) : '';
      if (appId && !selectedAppId) {
        setSelectedAppId(appId);
      }

      const scopedInstances = (i || []).filter((x: Instance) => x.appId === (selectedAppId || appId));
      const fallbackInstanceId = scopedInstances[0]?.id ? String(scopedInstances[0].id) : '';
      if (fallbackInstanceId && !selectedInstanceId) {
        setSelectedInstanceId(fallbackInstanceId);
      }

      const defaultClusterId = (c || [])[0]?.id ? String((c || [])[0].id) : '';
      if (defaultClusterId) {
        setAppForm((prev) => (prev.clusterId ? prev : { ...prev, clusterId: defaultClusterId }));
        setInstanceForm((prev) => (prev.clusterId ? prev : { ...prev, clusterId: defaultClusterId }));
      }

      const appCandidates = (a || []).slice(0, 3).map((x: App) => x.id);
      const instCandidates = (i || []).slice(0, 3).map((x: Instance) => x.id);
      const [appLayouts, instLayouts] = await Promise.all([
        Promise.allSettled(appCandidates.map((id: string) => opsApi.apps.getWidgetLayout(id))),
        Promise.allSettled(instCandidates.map((id: string) => opsApi.instances.getWidgetLayout(id))),
      ]);
      const appReady = appLayouts.some((res) => res.status === 'fulfilled' && Array.isArray(res.value?.widgets) && res.value.widgets.length > 0);
      const instReady = instLayouts.some((res) => res.status === 'fulfilled' && Array.isArray(res.value?.widgets) && res.value.widgets.length > 0);
      setWidgetReady(appReady || instReady);
    } catch (e: any) {
      setError(String(e || 'Failed to load onboarding data'));
    } finally {
      setLoading(false);
    }
  }, [selectedAppId, selectedInstanceId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const instancesForSelectedApp = React.useMemo(
    () => instances.filter((x) => x.appId === selectedAppId),
    [instances, selectedAppId],
  );

  React.useEffect(() => {
    if (!selectedAppId) {
      setSelectedInstanceId('');
      return;
    }
    const exists = instancesForSelectedApp.some((x) => x.id === selectedInstanceId);
    if (!exists) {
      setSelectedInstanceId(instancesForSelectedApp[0]?.id || '');
    }
  }, [selectedAppId, selectedInstanceId, instancesForSelectedApp]);

  React.useEffect(() => {
    if (!selectedAppId) return;
    setInstanceForm((prev) => (prev.appId ? prev : { ...prev, appId: selectedAppId }));
  }, [selectedAppId]);

  const done = {
    cluster: clusters.length > 0,
    app: apps.length > 0,
    instance: instances.length > 0,
    widget: widgetReady,
    rule: rules.length > 0,
  };

  const steps: StepItem[] = [
    {
      id: 'cluster',
      title: '1. 클러스터 연결',
      desc: 'Prometheus endpoint 연결/테스트',
      done: done.cluster,
      href: '/ops/clusters',
    },
    {
      id: 'app',
      title: '2. 앱 등록',
      desc: 'job 기반 앱 등록 및 상태 확인',
      done: done.app,
      href: '/ops/apps',
    },
    {
      id: 'instance',
      title: '3. 인스턴스 등록',
      desc: 'VM target 연결 및 앱 매핑',
      done: done.instance,
      href: '/ops/instances',
    },
    {
      id: 'widget',
      title: '4. 위젯 커스텀',
      desc: '앱/인스턴스 상세에서 위젯 ON/OFF/커스텀',
      done: done.widget,
      href: selectedAppId ? `/ops/apps/${selectedAppId}` : '/ops/apps',
    },
    {
      id: 'rule',
      title: '5. 룰 생성',
      desc: '프리셋 또는 커스텀 룰 생성',
      done: done.rule,
      href: '/ops/rules',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  const createRulePack = async (pack: RulePack) => {
    if (!selectedAppId) {
      setError('먼저 App을 선택하세요.');
      return;
    }
    if (pack.id === 'instance_guard' && !selectedInstanceId) {
      setError('인스턴스 보호 Pack은 인스턴스 선택이 필요합니다.');
      return;
    }

    setRunningPackId(pack.id);
    setError(null);
    try {
      const app = apps.find((x) => x.id === selectedAppId);
      const appName = app?.name || selectedAppId;
      const instance = instances.find((x) => x.id === selectedInstanceId);
      const instanceName = instance?.name || selectedInstanceId;

      await Promise.all(
        pack.presetIds.map((presetId) =>
          opsApi.rules.createFromPreset({
            appId: selectedAppId,
            instanceId: pack.id === 'instance_guard' ? selectedInstanceId : undefined,
            name:
              pack.id === 'instance_guard'
                ? `[Onboarding] ${presetId} - ${appName} (${instanceName})`
                : `[Onboarding] ${presetId} - ${appName}`,
          }),
        ),
      );

      await load();
      alert(`${pack.title} 생성 완료`);
    } catch (e: any) {
      setError(String(e || 'Failed to create rule pack'));
    } finally {
      setRunningPackId(null);
    }
  };

  const createClusterQuick = async () => {
    const name = String(clusterForm.name || '').trim();
    const prometheusUrl = String(clusterForm.prometheusUrl || '').trim();
    if (!name || !prometheusUrl) {
      setError('Cluster name / prometheusUrl은 필수입니다.');
      return;
    }
    setCreating('cluster');
    setError(null);
    setVerifyCluster({ status: 'running', message: 'cluster 생성 후 연결 테스트 중...' });
    try {
      const created = await opsApi.clusters.create({
        bearerToken: String(clusterForm.bearerToken || '').trim() || undefined,
      });
      try {
        const test = await opsApi.clusters.test(created.id);
        setVerifyCluster({
          status: test?.ok ? 'pass' : 'fail',
          message: test?.ok ? `PASS: cluster test ok (jobs=${test?.jobsCount ?? 0})` : `FAIL: cluster test failed (${String(test?.error || 'unknown')})`,
        });
      } catch (e: any) {
        setVerifyCluster({ status: 'fail', message: `FAIL: cluster test error (${String(e || 'unknown')})` });
      }
      setClusterForm((prev) => ({ ...prev, name: '', bearerToken: '' }));
      setAppForm((prev) => ({ ...prev, clusterId: created.id }));
      setInstanceForm((prev) => ({ ...prev, clusterId: created.id }));
      await load();
    } catch (e: any) {
      setError(String(e || 'Cluster create failed'));
    } finally {
      setCreating(null);
    }
  };

  const createAppQuick = async () => {
    const clusterId = String(appForm.clusterId || '').trim();
    const name = String(appForm.name || '').trim();
    const job = String(appForm.job || '').trim();
    if (!clusterId || !name || !job) {
      setError('App 생성은 clusterId/name/job이 필요합니다.');
      return;
    }
    setCreating('app');
    setError(null);
    setVerifyApp({ status: 'running', message: 'app 생성 후 job 테스트 중...' });
    try {
      const created = await opsApi.apps.create({
        owner: String(appForm.owner || '').trim() || undefined,
      });
      try {
        const test = await opsApi.apps.testJob(created.id);
        setVerifyApp({
          status: test?.ok ? 'pass' : 'fail',
          message: test?.ok ? `PASS: app test ok (value=${String(test?.value ?? '-')})` : `FAIL: app test failed (${String(test?.error || 'unknown')})`,
        });
      } catch (e: any) {
        setVerifyApp({ status: 'fail', message: `FAIL: app test error (${String(e || 'unknown')})` });
      }
      setAppForm((prev) => ({ ...prev, name: '', owner: '', job: '' }));
      setSelectedAppId(created.id);
      setInstanceForm((prev) => ({ ...prev, clusterId: created.clusterId, appId: created.id }));
      await load();
    } catch (e: any) {
      setError(String(e || 'App create failed'));
    } finally {
      setCreating(null);
    }
  };

  const discoverTargets = async () => {
    const clusterId = String(instanceForm.clusterId || '').trim();
    if (!clusterId) {
      setError('Target discover를 위해 cluster를 선택하세요.');
      return;
    }
    setDiscovering(true);
    setError(null);
    try {
      const res = await opsApi.instances.discover(clusterId);
      const hints = Array.isArray(res?.targets) ? res.targets : Array.isArray(res?.instances) ? res.instances : [];
      setInstanceHints(hints);
    } catch (e: any) {
      setError(String(e || 'Target discover failed'));
    } finally {
      setDiscovering(false);
    }
  };

  const createInstanceQuick = async () => {
    const clusterId = String(instanceForm.clusterId || '').trim();
    const name = String(instanceForm.name || '').trim();
    const provider = String(instanceForm.provider || '').trim();
    const prometheusInstance = String(instanceForm.prometheusInstance || '').trim();
    if (!clusterId || !name || !provider || !prometheusInstance) {
      setError('Instance 생성은 clusterId/name/provider/prometheusInstance가 필요합니다.');
      return;
    }
    setCreating('instance');
    setError(null);
    setVerifyInstance({ status: 'running', message: 'instance 생성 후 target 테스트 중...' });
    try {
      const created = await opsApi.instances.create({
        appId: String(instanceForm.appId || '').trim() || undefined,
        publicIp: String(instanceForm.publicIp || '').trim() || undefined,
      });
      try {
        const test = await opsApi.instances.test(created.id);
        setVerifyInstance({
          status: test?.ok ? 'pass' : 'fail',
          message: test?.ok
            ? `PASS: instance test ok (upSum=${String(test?.upSum ?? '-')}, series=${String(test?.seriesCount ?? '-')})`
            : `FAIL: instance test failed (${String(test?.error || 'unknown')})`,
        });
      } catch (e: any) {
        setVerifyInstance({ status: 'fail', message: `FAIL: instance test error (${String(e || 'unknown')})` });
      }
      setInstanceForm((prev) => ({
        ...prev,
        name: '',
        publicIp: '',
        prometheusInstance: '',
      }));
      setSelectedInstanceId(created.id);
      if (created.appId) setSelectedAppId(created.appId);
      await load();
    } catch (e: any) {
      setError(String(e || 'Instance create failed'));
    } finally {
      setCreating(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          <p className="text-gray-600 mt-1">클러스터 연결부터 위젯/룰 생성까지 한 화면에서 진행합니다.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div> : null}

      <div className="mb-6 p-5 rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="font-semibold text-gray-900">진행률</div>
          <div className="text-sm text-gray-700">
            {completedCount} / {steps.length}
          </div>
        </div>
        <div className="h-2 rounded bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${Math.round((completedCount / steps.length) * 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-6">
        {steps.map((s) => (
          <Link key={s.id} href={s.href} className="p-4 rounded-xl border bg-white hover:bg-gray-50">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">{s.title}</div>
              <span
                className={
                  s.done
                    ? 'text-[11px] px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200'
                    : 'text-[11px] px-2 py-0.5 rounded border bg-gray-50 text-gray-700 border-gray-200'
                }
              >
                {s.done ? 'DONE' : 'TODO'}
              </span>
            </div>
            <div className="text-xs text-gray-600 mt-2">{s.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">빠른 이동</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <Link href="/ops/clusters" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">Clusters 열기</Link>
            <Link href="/ops/apps" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">Apps 열기</Link>
            <Link href="/ops/instances" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">Instances 열기</Link>
            <Link href="/ops/rules" className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">Rules 열기</Link>
            {selectedAppId ? (
              <Link href={`/ops/apps/${selectedAppId}`} className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">
                선택 앱 위젯 편집
              </Link>
            ) : null}
            {selectedInstanceId ? (
              <Link href={`/ops/instances/${selectedInstanceId}`} className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50">
                선택 인스턴스 위젯 편집
              </Link>
            ) : null}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">1-Click Preset 강화</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-600 mb-1">App</div>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
              >
                <option value="">Select app</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.job})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Instance (optional for app packs, required for instance pack)</div>
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
              >
                <option value="">Select instance</option>
                {instancesForSelectedApp.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.prometheusInstance})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {RULE_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => createRulePack(pack)}
                  disabled={!selectedAppId || runningPackId !== null || (pack.id === 'instance_guard' && !selectedInstanceId)}
                  className="w-full text-left px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-60"
                >
                  <div className="text-sm font-medium text-gray-900">{pack.title}</div>
                  <div className="text-xs text-gray-600 mt-1">{pack.desc}</div>
                  <div className="text-[11px] text-gray-500 mt-1">{pack.presetIds.join(', ')}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Step 1: Quick Cluster Create
            <HelpTip
              title="왜 필요한가?"
              body={'Prometheus 연결의 시작점입니다.\nCluster가 있어야 App/Instance에서 메트릭 조회와 룰 평가를 진행할 수 있습니다.'}
            />
          </h2>
          <div className="space-y-2">
            <input
              value={clusterForm.name}
              onChange={(e) => setClusterForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Cluster name"
              className="w-full px-3 py-2 rounded-lg border text-sm"
            />
            <input
              value={clusterForm.prometheusUrl}
              onChange={(e) => setClusterForm((f) => ({ ...f, prometheusUrl: e.target.value }))}
              placeholder="http://host:9090/api/v1/query"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
            />
            <input
              value={clusterForm.bearerToken}
              onChange={(e) => setClusterForm((f) => ({ ...f, bearerToken: e.target.value }))}
              placeholder="Bearer token (optional)"
              className="w-full px-3 py-2 rounded-lg border text-sm"
            />
            <button
              type="button"
              onClick={createClusterQuick}
              disabled={creating !== null}
              className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {creating === 'cluster' ? 'Creating...' : 'Create Cluster'}
            </button>
            {verifyCluster.status !== 'idle' ? (
              <div
                className={
                  verifyCluster.status === 'pass'
                    ? 'text-xs p-2 rounded border bg-green-50 text-green-700 border-green-200'
                    : verifyCluster.status === 'fail'
                    ? 'text-xs p-2 rounded border bg-red-50 text-red-700 border-red-200'
                    : 'text-xs p-2 rounded border bg-amber-50 text-amber-800 border-amber-200'
                }
              >
                {verifyCluster.message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Step 2: Quick App Create
            <HelpTip
              title="왜 필요한가?"
              body={'App은 job 단위 모니터링 스코프입니다.\n위젯/룰/알림 대부분이 App 기준으로 동작합니다.'}
            />
          </h2>
          <div className="space-y-2">
            <select
              value={appForm.clusterId}
              onChange={(e) => setAppForm((f) => ({ ...f, clusterId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
            >
              <option value="">Select cluster</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={appForm.name}
              onChange={(e) => setAppForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="App name"
              className="w-full px-3 py-2 rounded-lg border text-sm"
            />
            <input
              value={appForm.job}
              onChange={(e) => setAppForm((f) => ({ ...f, job: e.target.value }))}
              placeholder="Prometheus job"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
            />
            <input
              value={appForm.owner}
              onChange={(e) => setAppForm((f) => ({ ...f, owner: e.target.value }))}
              placeholder="Owner/team (optional)"
              className="w-full px-3 py-2 rounded-lg border text-sm"
            />
            <button
              type="button"
              onClick={createAppQuick}
              disabled={creating !== null}
              className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {creating === 'app' ? 'Creating...' : 'Create App'}
            </button>
            {verifyApp.status !== 'idle' ? (
              <div
                className={
                  verifyApp.status === 'pass'
                    ? 'text-xs p-2 rounded border bg-green-50 text-green-700 border-green-200'
                    : verifyApp.status === 'fail'
                    ? 'text-xs p-2 rounded border bg-red-50 text-red-700 border-red-200'
                    : 'text-xs p-2 rounded border bg-amber-50 text-amber-800 border-amber-200'
                }
              >
                {verifyApp.message}
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">
            Step 3: Quick Instance Create
            <HelpTip
              title="왜 필요한가?"
              body={'Instance는 VM/노드 관찰 단위입니다.\n메모리/스왑/로드 기반 인프라 알림과 인스턴스 위젯에 사용됩니다.'}
            />
          </h2>
          <div className="space-y-2">
            <select
              value={instanceForm.clusterId}
              onChange={(e) => setInstanceForm((f) => ({ ...f, clusterId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
            >
              <option value="">Select cluster</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={instanceForm.appId}
              onChange={(e) => setInstanceForm((f) => ({ ...f, appId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
            >
              <option value="">None (optional)</option>
              {apps.filter((a) => a.clusterId === instanceForm.clusterId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.job})
                </option>
              ))}
            </select>
            <input
              value={instanceForm.name}
              onChange={(e) => setInstanceForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Instance name"
              className="w-full px-3 py-2 rounded-lg border text-sm"
            />
            <input
              value={instanceForm.publicIp}
              onChange={(e) => setInstanceForm((f) => ({ ...f, publicIp: e.target.value }))}
              placeholder="Public IP (optional)"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
            />
            <div className="flex gap-2">
              <input
                value={instanceForm.prometheusInstance}
                onChange={(e) => setInstanceForm((f) => ({ ...f, prometheusInstance: e.target.value }))}
                placeholder="Prometheus target (ex. 1.2.3.4:9100)"
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono"
              />
              <button
                type="button"
                onClick={discoverTargets}
                disabled={discovering}
                className="px-3 py-2 rounded-lg border text-xs bg-white hover:bg-gray-50 disabled:opacity-60"
              >
                {discovering ? 'Discovering...' : 'Discover'}
              </button>
            </div>
            {instanceHints.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {instanceHints.slice(0, 10).map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setInstanceForm((f) => ({ ...f, prometheusInstance: target }))}
                    className="px-2 py-1 rounded border text-[11px] bg-gray-50 hover:bg-gray-100 font-mono"
                  >
                    {target}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={createInstanceQuick}
              disabled={creating !== null}
              className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {creating === 'instance' ? 'Creating...' : 'Create Instance'}
            </button>
            {verifyInstance.status !== 'idle' ? (
              <div
                className={
                  verifyInstance.status === 'pass'
                    ? 'text-xs p-2 rounded border bg-green-50 text-green-700 border-green-200'
                    : verifyInstance.status === 'fail'
                    ? 'text-xs p-2 rounded border bg-red-50 text-red-700 border-red-200'
                    : 'text-xs p-2 rounded border bg-amber-50 text-amber-800 border-amber-200'
                }
              >
                {verifyInstance.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
