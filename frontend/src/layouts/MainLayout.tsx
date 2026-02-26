import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, Settings, Bell } from 'lucide-react';
import { useRouter } from 'next/router';
import { authApi, WorkspaceSummary } from '@/features/auth/api/auth.api';
import PingoLogo from '@/components/brand/PingoLogo';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const path = router.pathname;
  const [workspaces, setWorkspaces] = React.useState<WorkspaceSummary[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = React.useState<string>('');
  const [switching, setSwitching] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [ws, me] = await Promise.all([authApi.workspaces(), authApi.me()]);
        if (!active) return;
        setWorkspaces(ws || []);
        setCurrentWorkspaceId(String(me?.workspace?.id || ''));
      } catch {
        if (!active) return;
        setWorkspaces([]);
        setCurrentWorkspaceId('');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [router.asPath]);

  const navItem = (href: string, label: string, Icon: any) => {
    const active = path === href || path.startsWith(href + '/');
    const cls = active
      ? 'flex items-center space-x-3 p-3 bg-blue-50 text-blue-700 rounded-lg font-medium'
      : 'flex items-center space-x-3 p-3 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors';
    return (
      <Link href={href} className={cls}>
        <Icon className="w-5 h-5" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 p-6">
        <div className="mb-10">
          <PingoLogo />
        </div>

        <nav className="space-y-2">
          {navItem('/dashboard', '대시보드', LayoutDashboard)}
          {navItem('/ops', '운영 설정', Settings)}
          {navItem('/ops/alerts', '알림 이벤트', Bell)}
        </nav>
        <div className="mt-6 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Workspace</div>
          <select
            value={currentWorkspaceId}
            onChange={async (e) => {
              const nextId = String(e.target.value || '');
              if (!nextId || nextId === currentWorkspaceId) return;
              try {
                setSwitching(true);
                await authApi.switchWorkspace(nextId);
                window.location.replace('/dashboard');
              } catch (err) {
                alert(String(err || 'Workspace switch failed'));
                setSwitching(false);
              }
            }}
            className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:opacity-60"
            disabled={switching || workspaces.length === 0}
          >
            {workspaces.length === 0 ? (
              <option value="">No workspace</option>
            ) : (
              workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </option>
              ))
            )}
          </select>
          <button
            onClick={async () => {
              const name = window.prompt('새 워크스페이스 이름을 입력하세요.');
              const trimmed = String(name || '').trim();
              if (!trimmed) return;
              try {
                setSwitching(true);
                await authApi.createWorkspace({ name: trimmed });
                window.location.replace('/dashboard');
              } catch (err) {
                alert(String(err || 'Workspace create failed'));
                setSwitching(false);
              }
            }}
            className="w-full px-3 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            disabled={switching}
          >
            워크스페이스 추가
          </button>
        </div>
        <button
          onClick={() => {
            authApi.logout();
            router.replace('/auth/login');
          }}
          className="mt-6 w-full px-3 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50"
        >
          로그아웃
        </button>
      </aside>

      
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
