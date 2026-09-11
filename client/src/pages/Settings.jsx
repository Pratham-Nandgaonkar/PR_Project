import React, { useState, useEffect } from 'react';
import { useRepository } from '../hooks/useRepository';
import { addRepository, deleteRepository, triggerSync, fetchSyncStatus } from '../lib/api';
import { formatDate, timeAgo } from '../lib/utils';
import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

export default function Settings() {
  const { repositories, refetch, selectedRepoId, setSelectedRepoId } = useRepository();
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [syncStatus, setSyncStatus] = useState(null);
  const [syncingRepo, setSyncingRepo] = useState(null);

  useEffect(() => {
    if (selectedRepoId) {
      fetchSyncStatus(selectedRepoId).then(setSyncStatus).catch(console.error);
    }
  }, [selectedRepoId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!owner || !name) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const repo = await addRepository(owner, name);
      await refetch();
      setSuccess(`Successfully added ${owner}/${name}`);
      setOwner('');
      setName('');
      // Trigger initial sync
      triggerSync(repo.id).catch(console.error);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, repoName) => {
    if (!window.confirm(`Are you sure you want to delete ${repoName}? This will remove all data.`)) return;
    try {
      await deleteRepository(id);
      if (selectedRepoId === id) setSelectedRepoId(null);
      await refetch();
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleSync = async (id) => {
    setSyncingRepo(id);
    try {
      await triggerSync(id);
      if (id === selectedRepoId) {
        const status = await fetchSyncStatus(id);
        setSyncStatus(status);
      }
    } catch (err) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncingRepo(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Add Repository</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Owner (e.g., facebook)"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              placeholder="Repository Name (e.g., react)"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !owner || !name}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>
        {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center gap-2 text-sm"><AlertCircle className="w-4 h-4" /> {error}</div>}
        {success && <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4" /> {success}</div>}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Current Repositories</h2>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-900/50 text-slate-400 text-sm">
            <tr>
              <th className="px-6 py-3 font-medium">Repository</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Last Synced</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {repositories.map(repo => (
              <tr key={repo.id} className={clsx("hover:bg-slate-700/30", selectedRepoId === repo.id && "bg-slate-700/20")}>
                <td className="px-6 py-4">
                  <button onClick={() => setSelectedRepoId(repo.id)} className="font-semibold text-blue-400 hover:underline">
                    {repo.full_name}
                  </button>
                  {selectedRepoId === repo.id && <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Selected</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={clsx("w-2 h-2 rounded-full", repo.is_active ? "bg-green-500" : "bg-slate-500")}></div>
                    <span className="text-sm text-slate-300">{repo.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {repo.last_synced_at ? timeAgo(repo.last_synced_at) : 'Never'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => handleSync(repo.id)}
                      disabled={syncingRepo === repo.id}
                      className="text-slate-400 hover:text-blue-400 transition-colors"
                      title="Sync Now"
                    >
                      <RefreshCw className={clsx("w-4 h-4", syncingRepo === repo.id && "animate-spin text-blue-400")} />
                    </button>
                    <button
                      onClick={() => handleDelete(repo.id, repo.full_name)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {repositories.length === 0 && (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-slate-400">No repositories added yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRepoId && syncStatus && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold mb-4">Sync Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-slate-400 mb-1">Current Status</div>
              <div className="flex items-center gap-2 text-slate-200">
                {syncStatus.is_syncing ? (
                  <><RefreshCw className="w-4 h-4 text-blue-400 animate-spin" /> Syncing...</>
                ) : (
                  <><CheckCircle className="w-4 h-4 text-green-400" /> Idle</>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-1">Last Synced</div>
              <div className="text-slate-200">{syncStatus.last_synced_at ? formatDate(syncStatus.last_synced_at) : 'Never'}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-1">Next Scheduled Sync</div>
              <div className="text-slate-200">{syncStatus.next_sync_at ? formatDate(syncStatus.next_sync_at) : 'Not scheduled'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 text-sm text-slate-400">
        <h3 className="font-semibold text-slate-300 mb-2">Note about API Limits</h3>
        <p>
          For better rate limits when scraping GitHub, make sure to set <code className="bg-slate-900 px-1.5 py-0.5 rounded text-blue-400">GITHUB_TOKEN</code> in your backend <code className="bg-slate-900 px-1.5 py-0.5 rounded">.env</code> file. 
          You can create a personal access token at <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">github.com/settings/tokens</a>.
        </p>
      </div>
    </div>
  );
}
