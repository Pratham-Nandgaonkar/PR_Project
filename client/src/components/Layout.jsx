import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, GitPullRequestDraft, Users, TrendingUp, Settings, GitPullRequest, RefreshCw } from 'lucide-react';
import { useRepository } from '../hooks/useRepository';
import { triggerSync, fetchSyncStatus } from '../lib/api';
import { timeAgo } from '../lib/utils';
import clsx from 'clsx';

export default function Layout() {
  const { selectedRepo, selectedRepoId, refetch } = useRepository();
  const [syncStatus, setSyncStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!selectedRepoId) return;
    const fetchStatus = async () => {
      try {
        const status = await fetchSyncStatus(selectedRepoId);
        setSyncStatus(status);
        setIsSyncing(!!status.is_syncing);
      } catch (e) {
        console.error('Failed to fetch sync status', e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [selectedRepoId]);

  const handleSync = async () => {
    if (!selectedRepoId || isSyncing) return;
    try {
      setIsSyncing(true);
      await triggerSync(selectedRepoId);
      const poll = async () => {
        try {
          const status = await fetchSyncStatus(selectedRepoId);
          setSyncStatus(status);
          if (!status.is_syncing && !status.isRunning) {
            setIsSyncing(false);
            if (refetch) refetch();
          } else {
            setTimeout(poll, 3500);
          }
        } catch (e) {
          setIsSyncing(false);
          if (refetch) refetch();
        }
      };
      setTimeout(poll, 3500);
    } catch (e) {
      console.error('Failed to trigger sync', e);
      setIsSyncing(false);
    }
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/prs', icon: GitPullRequestDraft, label: 'Pull Requests' },
    { to: '/people', icon: Users, label: 'People' },
    { to: '/trends', icon: TrendingUp, label: 'Trends' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-900 text-slate-100 font-sans">
      <aside className="w-60 bg-slate-800 flex flex-col h-full border-r border-slate-700">
        <div className="p-6">
          <div className="flex items-center gap-3 text-blue-400 font-bold text-xl mb-1">
            <GitPullRequest className="w-6 h-6" />
            PR Aging
          </div>
          {selectedRepo && (
            <div className="text-sm text-slate-400 truncate" title={selectedRepo.name}>
              {selectedRepo.name}
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium',
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {selectedRepoId && (
          <div className="p-4 border-t border-slate-700">
            <div className="flex flex-col gap-2">
              <div className="text-xs text-slate-400">
                {syncStatus?.last_synced_at
                  ? `Last synced: ${timeAgo(syncStatus.last_synced_at)}`
                  : 'Not synced yet'}
              </div>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={clsx(
                  'flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                  isSyncing
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                <RefreshCw className={clsx("w-4 h-4", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto p-6 bg-slate-900">
        <Outlet />
      </main>
    </div>
  );
}
