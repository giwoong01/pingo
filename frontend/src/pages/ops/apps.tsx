import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { opsApi, App, Cluster } from '@/features/ops/api/ops.api';
import Link from 'next/link';

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ clusterId: '', name: '', owner: '', job: '' });
  const [jobHints, setJobHints] = useState<string[]>([]);
  const [jobHintSets, setJobHintSets] = useState<{ up: string[]; down: string[]; jvm: string[]; http: string[] }>({
    up: [],
    down: [],
    jvm: [],
    http: [],
  });
  const [jobLoading, setJobLoading] = useState(false);
  const [monitorKind, setMonitorKind] = useState<'JVM' | 'HTTP' | 'BOTH'>('BOTH');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a] = await Promise.all([opsApi.clusters.list(), opsApi.apps.list()]);
      setClusters(c);
      setApps(a);
      if (!form.clusterId && c[0]?.id) setForm((f) => ({ ...f, clusterId: c[0].id }));
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const clusterNameById = useMemo(() => {
    const m = new Map<string, string>();
    clusters.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [clusters]);

  const create = async () => {
    setError(null);
    try {
      await opsApi.apps.create({ ...form });
      setForm((f) => ({ ...f, name: '', owner: '', job: '' }));
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const fetchJobs = async () => {
    if (!form.clusterId) return;
    setJobLoading(true);
    setError(null);
    try {
      const r = await opsApi.clusters.jobHints(form.clusterId);
      const all = Array.isArray(r?.allJobs) ? r.allJobs : [];
      setJobHints(all);
      setJobHintSets({
        up: Array.isArray(r?.upJobs) ? r.upJobs : [],
        down: Array.isArray(r?.downJobs) ? r.downJobs : [],
        jvm: Array.isArray(r?.jvmJobs) ? r.jvmJobs : [],
        http: Array.isArray(r?.httpJobs) ? r.httpJobs : [],
      });
    } catch (e: any) {
      setError(String(e));
    } finally {
      setJobLoading(false);
    }
  };

  const testJob = async (id: string) => {
    setError(null);
    try {
      const r = await opsApi.apps.testJob(id);
      alert(`ok=${r.ok} value=${r.value}\n${r.query}`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete app?')) return;
    setError(null);
    try {
      await opsApi.apps.remove(id);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apps</h1>
          <p className="text-gray-600 mt-1">job 중심으로 앱을 등록합니다 (예: billing-prod).</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Create</h2>
          <label className="text-xs text-gray-600">Cluster</label>
          <select
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.clusterId}
            onChange={(e) => setForm({ ...form, clusterId: e.target.value })}
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-gray-600">Name</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Billing API"
          />
          <label className="text-xs text-gray-600">Owner/Team (optional)</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.owner}
            onChange={(e) => setForm({ ...form, owner: e.target.value })}
            placeholder="team-platform"
          />
          <label className="text-xs text-gray-600">Job</label>
          <input
            className="w-full mt-1 mb-4 px-3 py-2 border rounded-lg"
            value={form.job}
            onChange={(e) => setForm({ ...form, job: e.target.value })}
            placeholder="billing-prod"
          />

          <div className="mb-2 text-xs text-gray-600">모니터링 타입</div>
          <div className="flex gap-2 mb-4">
            {(['BOTH', 'JVM', 'HTTP'] as const).map((k) => {
              const active = monitorKind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMonitorKind(k)}
                  className={
                    active
                      ? 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs'
                      : 'px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs'
                  }
                >
                  {k}
                </button>
              );
            })}
          </div>

          <button
            onClick={fetchJobs}
            disabled={!form.clusterId || jobLoading}
            className="w-full mb-4 px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"
          >
            {jobLoading ? 'Fetching jobs...' : 'Fetch jobs from Prometheus'}
          </button>
          {jobHints.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-600 mb-2">
                추천 job (클릭하면 입력칸에 채워짐) {jobHintSets.down.includes(form.job) ? '• 현재 DOWN' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {(monitorKind === 'JVM'
                  ? jobHintSets.jvm
                  : monitorKind === 'HTTP'
                  ? jobHintSets.http
                  : jobHints
                )
                  .slice(0, 20)
                  .map((j) => {
                    const isUp = jobHintSets.up.includes(j);
                    const isDown = jobHintSets.down.includes(j);
                    const badge = isUp ? 'UP' : isDown ? 'DOWN' : '';
                    const cls = isUp
                      ? 'border-green-200 bg-green-50 hover:bg-green-100'
                      : isDown
                      ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      : 'border-gray-200 bg-white hover:bg-gray-50';
                    return (
                      <button
                        key={j}
                        onClick={() => setForm({ ...form, job: j })}
                        className={`px-2 py-1 rounded border text-xs ${cls}`}
                        type="button"
                        title={
                          (jobHintSets.jvm.includes(j) ? 'JVM ' : '') +
                          (jobHintSets.http.includes(j) ? 'HTTP ' : '') +
                          (isUp ? 'UP' : isDown ? 'DOWN' : '')
                        }
                      >
                        {j} {badge ? `(${badge})` : ''}
                      </button>
                    );
                  })}
              </div>
              <div className="text-xs text-gray-600 mt-2">
                JVM 프리셋(Heap/GC)은 <code>JVM</code> 타입에서 추천되는 job만 선택하세요.
              </div>
            </div>
          )}
          <button
            onClick={create}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
          >
            Create App
          </button>

          <div className="mt-5 p-4 rounded-lg bg-gray-50 border text-sm text-gray-700">
            <div className="font-semibold text-gray-900 mb-2">튜토리얼: 예시 입력</div>
            <pre className="text-xs whitespace-pre-wrap">
{`Cluster: prod-prom
Name: Billing API
Job: billing-prod`}
            </pre>
            <div className="text-xs text-gray-600 mt-2">
              Tip: job은 “환경 포함 유니크”로 맞추는 걸 권장합니다. 예: <code>billing-prod</code>,{' '}
              <code>billing-stage</code>.
            </div>
            <div className="text-xs text-gray-600 mt-2">
              모르면 위의 <b>Fetch jobs from Prometheus</b> 버튼을 눌러 현재 Prometheus에 등록된 job 목록에서 선택하세요.
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">List</h2>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : apps.length === 0 ? (
            <div className="text-sm text-gray-600">No apps</div>
          ) : (
            <div className="divide-y">
              {apps.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{a.name}</div>
                    <div className="text-xs text-gray-600 truncate">
                      owner={a.owner || '-'} • job={a.job} • cluster={clusterNameById.get(a.clusterId) || a.clusterId}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/ops/apps/${a.id}`}
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => testJob(a.id)}
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
