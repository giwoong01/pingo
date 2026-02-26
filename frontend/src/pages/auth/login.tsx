import React, { useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { authApi } from '@/features/auth/api/auth.api';
import { setAccessToken } from '@/utils/api';
import PingoLogo from '@/components/brand/PingoLogo';

export default function LoginPage() {
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
      const res = await authApi.login({ email, password });
      setAccessToken(res.accessToken);
      setTimeout(() => {
        window.location.replace('/dashboard');
      }, 0);
    } catch (err: any) {
      setError(String(err || 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border rounded-xl p-6 shadow-sm">
        <PingoLogo size="lg" className="mb-4" />
        <h1 className="text-xl font-semibold text-gray-900">로그인</h1>
        <p className="text-sm text-gray-600 mt-1">Pingo 워크스페이스에 로그인합니다.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
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
            placeholder="Password"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            required
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={loading} className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          계정이 없나요? <Link href="/auth/register" className="text-blue-700 underline">회원가입</Link>
        </div>
      </div>
    </div>
  );
}
