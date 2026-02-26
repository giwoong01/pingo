import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { opsApi, App, Cluster, Instance } from '@/features/ops/api/ops.api';
import Link from 'next/link';

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clusterId: '',
    appId: '',
    name: '',
    owner: '',
    provider: 'oracle',
    publicIp: '',
    privateIp: '',
    region: '',
    env: '',
    prometheusInstance: '',
  });
  const [instanceHints, setInstanceHints] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, i, a] = await Promise.all([opsApi.clusters.list(), opsApi.instances.list(), opsApi.apps.list()]);
      setClusters(c);
      setInstances(i);
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
  const appLabelById = useMemo(() => {
    const m = new Map<string, string>();
    apps.forEach((a) => m.set(a.id, `${a.name} (${a.job})`));
    return m;
  }, [apps]);
  const appsForSelectedCluster = useMemo(() => apps.filter((a) => a.clusterId === form.clusterId), [apps, form.clusterId]);

  const create = async () => {
    setError(null);
    try {
      await opsApi.instances.create({ ...form, appId: form.appId || null });
      setForm((f) => ({
        ...f,
        appId: '',
        name: '',
        owner: '',
        publicIp: '',
        privateIp: '',
        region: '',
        env: '',
        prometheusInstance: '',
      }));
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const discover = async () => {
    if (!form.clusterId) return;
    setHintLoading(true);
    setError(null);
    try {
      const r = await opsApi.instances.discover(form.clusterId);
      setInstanceHints(Array.isArray(r?.targets) ? r.targets : Array.isArray(r?.instances) ? r.instances : []);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setHintLoading(false);
    }
  };

  const test = async (id: string) => {
    setError(null);
    try {
      const r = await opsApi.instances.test(id);
      alert(`ok=${r.ok} upSum=${r.upSum} seriesCount=${r.seriesCount}`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete VM instance?')) return;
    setError(null);
    try {
      await opsApi.instances.remove(id);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cloud Instances</h1>
          <p className="text-gray-600 mt-1">Oracle/GCP/AWS VM 인스턴스를 등록하고 Prometheus 타겟과 연결합니다.</p>
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
            onChange={(e) => setForm({ ...form, clusterId: e.target.value, appId: '' })}
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
            placeholder="Oracle Prod VM"
          />
          <label className="text-xs text-gray-600">Owner/Team (optional)</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.owner}
            onChange={(e) => setForm({ ...form, owner: e.target.value })}
            placeholder="team-platform"
          />

          <label className="text-xs text-gray-600">Prometheus Target (required)</label>
          <input
            className="w-full mt-1 mb-4 px-3 py-2 border rounded-lg font-mono"
            value={form.prometheusInstance}
            onChange={(e) => setForm({ ...form, prometheusInstance: e.target.value })}
            placeholder="134.185.100.182:9100"
          />
          <div className="text-xs text-gray-600 mb-4">
            `Discover Prometheus targets` 결과에서 하나를 선택해 넣는 것을 권장합니다.
          </div>

          <label className="text-xs text-gray-600">Linked App (optional)</label>
          <select
            className="w-full mt-1 mb-4 px-3 py-2 border rounded-lg"
            value={form.appId}
            onChange={(e) => setForm({ ...form, appId: e.target.value })}
          >
            <option value="">None</option>
            {appsForSelectedCluster.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.job})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full mb-3 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-xs"
          >
            {showAdvanced ? 'Hide Advanced Fields' : 'Show Advanced Fields'}
          </button>

          {showAdvanced && (
            <div className="mb-4 p-3 rounded-lg border bg-gray-50">
              <label className="text-xs text-gray-600">Provider</label>
              <select
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              >
                <option value="oracle">Oracle</option>
                <option value="gcp">GCP</option>
                <option value="aws">AWS</option>
                <option value="other">Other</option>
              </select>

              <label className="text-xs text-gray-600">Public IP (optional)</label>
              <input
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg font-mono"
                value={form.publicIp}
                onChange={(e) => setForm({ ...form, publicIp: e.target.value })}
                placeholder="134.185.100.182"
              />

              <label className="text-xs text-gray-600">Private IP (optional)</label>
              <input
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg font-mono"
                value={form.privateIp}
                onChange={(e) => setForm({ ...form, privateIp: e.target.value })}
                placeholder="10.0.0.11"
              />

              <label className="text-xs text-gray-600">Region / Zone (optional)</label>
              <input
                className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="ap-chuncheon-1"
              />

              <label className="text-xs text-gray-600">Environment (optional)</label>
              <input
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                value={form.env}
                onChange={(e) => setForm({ ...form, env: e.target.value })}
                placeholder="prod"
              />
            </div>
          )}

          <button
            onClick={discover}
            disabled={!form.clusterId || hintLoading}
            className="w-full mb-4 px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"
          >
            {hintLoading ? 'Discovering...' : 'Discover Prometheus targets'}
          </button>

          {instanceHints.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-600 mb-2">추천 target (클릭 시 자동 입력)</div>
              <div className="flex flex-wrap gap-2">
                {instanceHints.slice(0, 30).map((inst) => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => setForm({ ...form, prometheusInstance: inst })}
                    className="px-2 py-1 rounded border text-xs font-mono bg-white hover:bg-gray-50"
                  >
                    {inst}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={create} className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
            Create Instance
          </button>
        </div>

        <div className="lg:col-span-2 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">List</h2>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : instances.length === 0 ? (
            <div className="text-sm text-gray-600">No cloud instances</div>
          ) : (
            <div className="divide-y">
              {instances.map((i) => (
                <div key={i.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{i.name}</div>
                    <div className="text-xs text-gray-600 truncate font-mono">
                      publicIp={i.publicIp || '-'} • target={i.prometheusInstance}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      owner={i.owner || '-'} • provider={i.provider} • env={i.env || '-'} • region={i.region || '-'} • cluster={clusterNameById.get(i.clusterId) || i.clusterId}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      app={i.appId ? appLabelById.get(i.appId) || i.appId : '-'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/ops/instances/${i.id}`}
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => test(i.id)}
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => remove(i.id)}
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
