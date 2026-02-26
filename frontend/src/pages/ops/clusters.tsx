import React, { useEffect, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { opsApi, Cluster } from '@/features/ops/api/ops.api';

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', prometheusUrl: '', bearerToken: '' });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setClusters(await opsApi.clusters.list());
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    setError(null);
    try {
      await opsApi.clusters.create({
        name: form.name,
        prometheusUrl: form.prometheusUrl,
        bearerToken: form.bearerToken || undefined,
      });
      setForm({ name: '', prometheusUrl: '', bearerToken: '' });
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  const test = async (id: string) => {
    setError(null);
    try {
      const r = await opsApi.clusters.test(id);
      alert(`ok=${r.ok} value=${r.value}`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete cluster?')) return;
    setError(null);
    try {
      await opsApi.clusters.remove(id);
      await refresh();
    } catch (e: any) {
      setError(String(e));
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clusters</h1>
          <p className="text-gray-600 mt-1">Prometheus endpoint와 bearer token을 등록합니다.</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Create</h2>
          <label className="text-xs text-gray-600">Name</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="prod-prom"
          />
          <label className="text-xs text-gray-600">Prometheus URL</label>
          <input
            className="w-full mt-1 mb-3 px-3 py-2 border rounded-lg"
            value={form.prometheusUrl}
            onChange={(e) => setForm({ ...form, prometheusUrl: e.target.value })}
            placeholder="http://host:9090/api/v1/query"
          />
          <label className="text-xs text-gray-600">Bearer Token</label>
          <input
            className="w-full mt-1 mb-4 px-3 py-2 border rounded-lg"
            value={form.bearerToken}
            onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
            placeholder="(optional)"
          />
          <button
            onClick={create}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
          >
            Create Cluster
          </button>

          <div className="mt-5 p-4 rounded-lg bg-gray-50 border text-sm text-gray-700">
            <div className="font-semibold text-gray-900 mb-2">튜토리얼: 예시 입력</div>
            <div className="text-xs text-gray-600 mb-2">Prometheus가 token 인증일 때 권장 예시</div>
            <pre className="text-xs whitespace-pre-wrap">
{`Name: prod-prom
Prometheus URL: http://134.185.100.182:9090/api/v1/query
Bearer Token: <PROM_TOKEN>`}
            </pre>
            <div className="text-xs text-gray-600 mt-2">
              Tip: URL에 <code>/api/v1/query</code>가 없어도 입력하면 자동으로 보정됩니다.
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">List</h2>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : clusters.length === 0 ? (
            <div className="text-sm text-gray-600">No clusters</div>
          ) : (
            <div className="divide-y">
              {clusters.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-xs text-gray-600 truncate">{c.prometheusUrl}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => test(c.id)}
                      className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => remove(c.id)}
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
