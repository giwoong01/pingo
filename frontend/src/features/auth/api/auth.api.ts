import { api, setAccessToken } from '@/utils/api';

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSec: number;
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name?: string; slug?: string };
  membership: { role: 'OWNER' | 'ADMIN' | 'MEMBER' };
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isCurrent?: boolean;
};

export type WorkspaceMember = {
  userId: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
  isMe: boolean;
};

export type WorkspaceInviteInfo = {
  id: string;
  token: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  invitedEmail: string | null;
  workspace: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
};

export type WorkspaceInviteListItem = {
  id: string;
  token: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  invitedEmail: string | null;
  createdByUserId: string;
  acceptedByUserId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
};

export const authApi = {
  register: async (body: { email: string; password: string; name?: string; workspaceName?: string }) => {
    const res = await api.post('/api/auth/register', body);
    if (!res?.accessToken) throw new Error('Register succeeded but no access token was returned');
    setAccessToken(res.accessToken);
    return res as AuthResponse;
  },
  login: async (body: { email: string; password: string }) => {
    const res = await api.post('/api/auth/login', body);
    if (!res?.accessToken) throw new Error('Login succeeded but no access token was returned');
    setAccessToken(res.accessToken);
    return res as AuthResponse;
  },
  me: () => api.get('/api/auth/me') as Promise<any>,
  workspaces: () => api.get('/api/auth/workspaces') as Promise<WorkspaceSummary[]>,
  createWorkspace: async (body: { name: string }) => {
    const res = await api.post('/api/auth/workspaces', body);
    if (res?.accessToken) setAccessToken(res.accessToken);
    return res as AuthResponse;
  },
  switchWorkspace: async (workspaceId: string) => {
    const res = await api.post('/api/auth/switch-workspace', { workspaceId });
    if (!res?.accessToken) throw new Error('Switch workspace failed: no access token');
    setAccessToken(res.accessToken);
    return res as AuthResponse;
  },
  listMembers: (workspaceId: string) => api.get(`/api/auth/workspaces/${workspaceId}/members`) as Promise<WorkspaceMember[]>,
  inviteMember: (workspaceId: string, body: { email: string; role?: 'OWNER' | 'ADMIN' | 'MEMBER' }) =>
    api.post(`/api/auth/workspaces/${workspaceId}/invite`, body) as Promise<any>,
  updateMemberRole: (workspaceId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') =>
    api.patch(`/api/auth/workspaces/${workspaceId}/members/${userId}`, { role }) as Promise<any>,
  removeMember: (workspaceId: string, userId: string) =>
    api.delete(`/api/auth/workspaces/${workspaceId}/members/${userId}`) as Promise<any>,
  createInviteLink: (
    workspaceId: string,
    body: { email?: string; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; expiresInHours?: number },
  ) => api.post(`/api/auth/workspaces/${workspaceId}/invite-link`, body) as Promise<any>,
  listInviteLinks: (workspaceId: string, params?: { status?: string; email?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.email) qs.set('email', params.email);
    const suffix = qs.toString();
    return api.get(`/api/auth/workspaces/${workspaceId}/invite-links${suffix ? `?${suffix}` : ''}`) as Promise<WorkspaceInviteListItem[]>;
  },
  revokeInviteLink: (workspaceId: string, inviteId: string) =>
    api.delete(`/api/auth/workspaces/${workspaceId}/invite-links/${inviteId}`) as Promise<any>,
  getInvite: (token: string) => api.get(`/api/auth/invites/${encodeURIComponent(token)}`) as Promise<WorkspaceInviteInfo>,
  acceptInvite: async (body: { token: string; email: string; password: string; name?: string }) => {
    const res = await api.post('/api/auth/accept-invite', body);
    if (!res?.accessToken) throw new Error('Accept invite failed: no access token');
    setAccessToken(res.accessToken);
    return res as AuthResponse;
  },
  logout: () => setAccessToken(undefined),
};
