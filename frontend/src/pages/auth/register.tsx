import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { authApi } from '@/features/auth/api/auth.api';
import { setAccessToken } from '@/utils/api';
import PingoLogo from '@/components/brand/PingoLogo';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const token = Cookies.get('access_token');
    if (token) {
      window.location.replace('/dashboard');
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.register({ email, password, name, workspaceName });
      setAccessToken(res.accessToken);
      setTimeout(() => {
        window.location.replace('/dashboard');
      }, 0);
    } catch (err: any) {
      setError(String(err || 'Register failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-xl p-6 shadow-sm">
        <PingoLogo size="lg" className="mb-4" />
        <h1 className="text-xl font-semibold text-gray-900">회원가입</h1>
        <p className="text-sm text-gray-600 mt-1">새 워크스페이스를 만들고 시작합니다.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full px-3 py-2 rounded-lg border text-sm"
          />
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Workspace Name (optional)"
            className="w-full px-3 py-2 rounded-lg border text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            minLength={8}
            required
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={loading} className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          이미 계정이 있나요? <Link href="/auth/login" className="text-blue-700 underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}
