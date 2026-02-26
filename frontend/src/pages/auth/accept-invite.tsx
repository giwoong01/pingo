import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { authApi } from '@/features/auth/api/auth.api';
import { setAccessToken } from '@/utils/api';

type InviteState = {
  status: 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  invitedEmail: string | null;
  workspace: { id: string; name: string | null; slug: string | null };
  expiresAt: string;
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [invite, setInvite] = React.useState<InviteState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setError('초대 토큰이 없습니다.');
      return;
    }
    (async () => {
      try {
        const res = await authApi.getInvite(token);
        setInvite(res as InviteState);
        if (res?.invitedEmail) setEmail(String(res.invitedEmail));
      } catch (e: any) {
        setError(String(e || '초대 정보를 불러올 수 없습니다.'));
      }
    })();
  }, [router.isReady, token]);

  const disabled = !invite || invite.status !== 'VALID' || loading;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">워크스페이스 초대 수락</h1>
        <p className="text-sm text-gray-600 mt-1">초대를 수락하고 바로 대시보드로 이동합니다.</p>

        {invite ? (
          <div className="mt-4 p-3 rounded border bg-gray-50 text-sm text-gray-700">
            <div>Workspace: <span className="font-medium">{invite.workspace?.name || '-'}</span></div>
            <div>Role: <span className="font-medium">{invite.role}</span></div>
            <div>Status: <span className="font-medium">{invite.status}</span></div>
            <div>Expires: <span className="font-medium">{new Date(invite.expiresAt).toLocaleString()}</span></div>
          </div>
        ) : null}

        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!token) return;
            setLoading(true);
            setError(null);
            try {
              const res = await authApi.acceptInvite({ token, email, password, name });
              setAccessToken(res.accessToken);
              window.location.replace('/dashboard');
            } catch (err: any) {
              setError(String(err || '초대 수락 실패'));
            } finally {
              setLoading(false);
            }
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 rounded border text-sm"
            required
            disabled={disabled || Boolean(invite?.invitedEmail)}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (신규 가입 시 사용)"
            className="w-full px-3 py-2 rounded border text-sm"
            disabled={disabled}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 rounded border text-sm"
            required
            minLength={8}
            disabled={disabled}
          />
          <button
            type="submit"
            disabled={disabled}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {loading ? '처리 중...' : '초대 수락'}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          이미 계정이 있나요? <Link href="/auth/login" className="text-blue-700 underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}
