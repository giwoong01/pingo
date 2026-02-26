import React from 'react';
import MainLayout from '@/layouts/MainLayout';
import { authApi, WorkspaceInviteListItem, WorkspaceMember } from '@/features/auth/api/auth.api';
import { opsApi } from '@/features/ops/api/ops.api';

export default function WorkspacePage() {
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [myRole, setMyRole] = React.useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [email, setEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [linkEmail, setLinkEmail] = React.useState('');
  const [linkRole, setLinkRole] = React.useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [expiresInHours, setExpiresInHours] = React.useState(72);
  const [inviteLink, setInviteLink] = React.useState('');
  const [inviteLinks, setInviteLinks] = React.useState<WorkspaceInviteListItem[]>([]);
  const [inviteStatusFilter, setInviteStatusFilter] = React.useState<'ALL' | 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED'>('ALL');
  const [inviteEmailFilter, setInviteEmailFilter] = React.useState('');
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [configJson, setConfigJson] = React.useState('');
  const [includeSecrets, setIncludeSecrets] = React.useState(false);
  const [configLoading, setConfigLoading] = React.useState(false);
  const [configSummary, setConfigSummary] = React.useState<any | null>(null);
  const [configError, setConfigError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadInviteLinks = React.useCallback(async () => {
    if (!workspaceId || myRole !== 'OWNER') {
      setInviteLinks([]);
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const list = await authApi.listInviteLinks(workspaceId, {
        status: inviteStatusFilter === 'ALL' ? undefined : inviteStatusFilter,
        email: String(inviteEmailFilter || '').trim() || undefined,
      });
      setInviteLinks(list || []);
    } catch (e: any) {
      setInviteError(String(e || 'Failed to load invite links'));
    } finally {
      setInviteLoading(false);
    }
  }, [workspaceId, myRole, inviteStatusFilter, inviteEmailFilter]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await authApi.me();
      const wid = String(me?.workspace?.id || '');
      const wsName = String(me?.workspace?.name || 'Workspace');
      const role = String(me?.membership?.role || 'MEMBER') as 'OWNER' | 'ADMIN' | 'MEMBER';
      setWorkspaceId(wid);
      setWorkspaceName(wsName);
      setMyRole(role);
      if (!wid) {
        setMembers([]);
        return;
      }
      const list = await authApi.listMembers(wid);
      setMembers(list || []);
    } catch (e: any) {
      setError(String(e || 'Failed to load workspace data'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    loadInviteLinks();
  }, [loadInviteLinks]);

  const canManage = myRole === 'OWNER';
  const toLocalTime = (value: string) => {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString();
  };
  const isExpiringSoon = (item: WorkspaceInviteListItem) => {
    if (item.status !== 'VALID') return false;
    const expires = new Date(item.expiresAt).getTime();
    if (Number.isNaN(expires)) return false;
    return expires - Date.now() <= 24 * 60 * 60 * 1000;
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">워크스페이스 멤버 관리</h1>
          <p className="text-gray-600 mt-1">
            현재 워크스페이스: <span className="font-medium text-gray-900">{workspaceName || '-'}</span> ({myRole})
          </p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Members</h2>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : members.length === 0 ? (
            <div className="text-sm text-gray-600">No members</div>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div key={m.userId} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{m.name || m.email}</div>
                    <div className="text-xs text-gray-600">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      disabled={!canManage || m.isMe}
                      onChange={async (e) => {
                        const role = e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER';
                        try {
                          await authApi.updateMemberRole(workspaceId, m.userId, role);
                          await load();
                        } catch (err: any) {
                          alert(String(err || 'Role update failed'));
                        }
                      }}
                      className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                    {canManage && !m.isMe ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove ${m.email}?`)) return;
                          try {
                            await authApi.removeMember(workspaceId, m.userId);
                            await load();
                          } catch (err: any) {
                            alert(String(err || 'Remove failed'));
                          }
                        }}
                        className="px-2 py-1 rounded border text-sm text-red-700 border-red-200 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl border bg-white">
          <h2 className="font-semibold text-gray-900 mb-4">Invite</h2>
          {!canManage ? (
            <div className="text-sm text-gray-600">OWNER만 멤버를 관리할 수 있습니다.</div>
          ) : (
            <div className="space-y-3">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="user@example.com"
                className="w-full px-3 py-2 rounded border text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')}
                className="w-full px-3 py-2 rounded border text-sm"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER">OWNER</option>
              </select>
              <button
                onClick={async () => {
                  const target = String(email || '').trim();
                  if (!target) return;
                  try {
                    await authApi.inviteMember(workspaceId, { email: target, role: inviteRole });
                    setEmail('');
                    setInviteRole('MEMBER');
                    await load();
                  } catch (err: any) {
                    alert(String(err || 'Invite failed'));
                  }
                }}
                className="w-full px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                Invite Member
              </button>
              <div className="text-xs text-gray-500">초대 대상은 먼저 회원가입이 되어 있어야 합니다.</div>

              <hr className="my-3" />
              <div className="text-sm font-medium text-gray-900">Invite Link</div>
              <input
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                type="email"
                placeholder="(optional) invited email"
                className="w-full px-3 py-2 rounded border text-sm"
              />
              <select
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')}
                className="w-full px-3 py-2 rounded border text-sm"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="OWNER">OWNER</option>
              </select>
              <input
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Number(e.target.value || 72))}
                type="number"
                min={1}
                max={336}
                className="w-full px-3 py-2 rounded border text-sm"
              />
              <div className="text-xs text-gray-500">
                만료 시간(시간 단위). 현재: <span className="font-medium">{expiresInHours}h</span>
                {' '}({Math.floor(expiresInHours / 24)}d {expiresInHours % 24}h)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExpiresInHours(24)}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  24h
                </button>
                <button
                  type="button"
                  onClick={() => setExpiresInHours(72)}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  72h (3d)
                </button>
                <button
                  type="button"
                  onClick={() => setExpiresInHours(168)}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                >
                  168h (7d)
                </button>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await authApi.createInviteLink(workspaceId, {
                      email: String(linkEmail || '').trim() || undefined,
                      role: linkRole,
                      expiresInHours: Number.isFinite(expiresInHours) ? expiresInHours : 72,
                    });
                    setInviteLink(String(res?.acceptUrl || ''));
                    await loadInviteLinks();
                  } catch (err: any) {
                    alert(String(err || 'Invite link create failed'));
                  }
                }}
                className="w-full px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
              >
                Generate Invite Link
              </button>
              {inviteLink ? (
                <div className="space-y-2">
                  <input readOnly value={inviteLink} className="w-full px-3 py-2 rounded border text-xs bg-gray-50" />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        alert('copied');
                      } catch {
                        alert('copy failed');
                      }
                    }}
                    className="w-full px-3 py-2 rounded border text-sm hover:bg-gray-50"
                  >
                    Copy Link
                  </button>
                </div>
              ) : null}

              <hr className="my-3" />
              <div className="text-sm font-medium text-gray-900">Invite Link History</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={inviteStatusFilter}
                  onChange={(e) => setInviteStatusFilter(e.target.value as 'ALL' | 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED')}
                  className="px-3 py-2 rounded border text-sm"
                >
                  <option value="ALL">ALL</option>
                  <option value="VALID">VALID</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="REVOKED">REVOKED</option>
                </select>
                <input
                  value={inviteEmailFilter}
                  onChange={(e) => setInviteEmailFilter(e.target.value)}
                  placeholder="filter by email"
                  className="px-3 py-2 rounded border text-sm"
                />
                <button
                  onClick={loadInviteLinks}
                  className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                  disabled={inviteLoading}
                >
                  Refresh Links
                </button>
              </div>
              {inviteError ? <div className="text-xs text-red-700">{inviteError}</div> : null}
              {inviteLoading ? (
                <div className="text-xs text-gray-600">Loading links...</div>
              ) : inviteLinks.length === 0 ? (
                <div className="text-xs text-gray-600">No invite links</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {inviteLinks.map((item) => (
                    <div key={item.id} className="border rounded-lg p-2 bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-900 truncate">
                            {item.invitedEmail || '(any email)'} / {item.role}
                          </div>
                          <div className="text-[11px] text-gray-600">
                            Status: <span className="font-medium">{item.status}</span>
                            {isExpiringSoon(item) ? <span className="text-amber-700"> (expiring within 24h)</span> : null}
                          </div>
                          <div className="text-[11px] text-gray-500">Created: {toLocalTime(item.createdAt)}</div>
                          <div className="text-[11px] text-gray-500">Expires: {toLocalTime(item.expiresAt)}</div>
                          {item.acceptedAt ? <div className="text-[11px] text-gray-500">Accepted: {toLocalTime(item.acceptedAt)}</div> : null}
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={async () => {
                              const url = `${window.location.origin}/auth/accept-invite?token=${encodeURIComponent(item.token)}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                alert('link copied');
                              } catch {
                                alert('copy failed');
                              }
                            }}
                            className="px-2 py-1 rounded border text-[11px] hover:bg-white"
                          >
                            Copy
                          </button>
                          {item.status === 'VALID' ? (
                            <button
                              onClick={async () => {
                                if (!confirm('Revoke this invite link?')) return;
                                try {
                                  await authApi.revokeInviteLink(workspaceId, item.id);
                                  await loadInviteLinks();
                                } catch (err: any) {
                                  alert(String(err || 'Revoke failed'));
                                }
                              }}
                              className="px-2 py-1 rounded border text-[11px] text-red-700 border-red-200 hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 p-5 rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">IaC Export / Import (JSON)</h2>
            <p className="text-xs text-gray-600 mt-1">
              룰/위젯/웹훅/라우팅/사일런스를 코드형 JSON으로 내보내고 다시 반영합니다.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(e) => setIncludeSecrets(e.target.checked)}
            />
            include secrets
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={async () => {
              setConfigLoading(true);
              setConfigError(null);
              setConfigSummary(null);
              try {
                const bundle = await opsApi.config.export(includeSecrets);
                const text = JSON.stringify(bundle, null, 2);
                setConfigJson(text);
              } catch (e: any) {
                setConfigError(String(e || 'Export failed'));
              } finally {
                setConfigLoading(false);
              }
            }}
            className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            disabled={configLoading}
          >
            Export to Editor
          </button>
          <button
            onClick={() => {
              if (!configJson.trim()) return;
              const blob = new Blob([configJson], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `aegis-ops-config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
          >
            Download JSON
          </button>
          <label className="px-3 py-2 rounded border text-sm hover:bg-gray-50 cursor-pointer">
            Load JSON File
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  setConfigJson(text);
                  setConfigError(null);
                } catch (err: any) {
                  setConfigError(String(err || 'Failed to read file'));
                } finally {
                  e.currentTarget.value = '';
                }
              }}
            />
          </label>
          <button
            onClick={async () => {
              if (!configJson.trim()) {
                setConfigError('Import JSON이 비어 있습니다.');
                return;
              }
              setConfigLoading(true);
              setConfigError(null);
              setConfigSummary(null);
              try {
                const parsed = JSON.parse(configJson);
                const res = await opsApi.config.import({ bundle: parsed, dryRun: true });
                setConfigSummary(res);
              } catch (e: any) {
                setConfigError(String(e || 'Dry-run failed'));
              } finally {
                setConfigLoading(false);
              }
            }}
            className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            disabled={configLoading}
          >
            Dry-run Import
          </button>
          <button
            onClick={async () => {
              if (!configJson.trim()) {
                setConfigError('Import JSON이 비어 있습니다.');
                return;
              }
              if (!confirm('현재 워크스페이스에 설정을 import(merge/upsert) 하시겠습니까?')) return;
              setConfigLoading(true);
              setConfigError(null);
              setConfigSummary(null);
              try {
                const parsed = JSON.parse(configJson);
                const res = await opsApi.config.import({ bundle: parsed, dryRun: false });
                setConfigSummary(res);
                await load();
                await loadInviteLinks();
              } catch (e: any) {
                setConfigError(String(e || 'Import failed'));
              } finally {
                setConfigLoading(false);
              }
            }}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            disabled={configLoading}
          >
            Apply Import
          </button>
        </div>

        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          placeholder='{"version":"aegis.ops.config.v1","data":{...}}'
          className="w-full min-h-[240px] font-mono text-xs px-3 py-2 rounded border"
        />
        {configError ? <div className="mt-2 text-xs text-red-700">{configError}</div> : null}
        {configSummary ? (
          <pre className="mt-3 p-3 rounded border bg-gray-50 text-xs overflow-auto">{JSON.stringify(configSummary, null, 2)}</pre>
        ) : null}
      </div>
    </MainLayout>
  );
}
