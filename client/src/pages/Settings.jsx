import React, { useState, useEffect } from 'react';
import { useRepository } from '../hooks/useRepository';
import { addRepository, deleteRepository, triggerSync, fetchSyncStatus, updateRepository } from '../lib/api';
import { formatDate, timeAgo } from '../lib/utils';
import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Save } from 'lucide-react';
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

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);
  const [bhConfig, setBhConfig] = useState({ timezone: 'UTC', workDays: [1,2,3,4,5], workStart: 9, workEnd: 18 });
  const [syncFilters, setSyncFilters] = useState([]);
  const [repoSettingsLoading, setRepoSettingsLoading] = useState(false);
  const [repoSettingsSuccess, setRepoSettingsSuccess] = useState('');

  useEffect(() => {
    if (selectedRepoId) {
      fetchSyncStatus(selectedRepoId).then(setSyncStatus).catch(console.error);
    }
  }, [selectedRepoId]);

  useEffect(() => {
    if (selectedRepo) {
      let parsedBh = { timezone: 'UTC', workDays: [1,2,3,4,5], workStart: 9, workEnd: 18 };
      let parsedFilters = [];
      try {
        if (selectedRepo.business_hours_config) parsedBh = typeof selectedRepo.business_hours_config === 'string' ? JSON.parse(selectedRepo.business_hours_config) : selectedRepo.business_hours_config;
      } catch (e) {}
      try {
        if (selectedRepo.sync_filters) parsedFilters = typeof selectedRepo.sync_filters === 'string' ? JSON.parse(selectedRepo.sync_filters) : selectedRepo.sync_filters;
      } catch (e) {}
      setBhConfig(parsedBh);
      setSyncFilters(parsedFilters);
    }
  }, [selectedRepo]);

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
      const pollStatus = async () => {
        try {
          const status = await fetchSyncStatus(id);
          if (id === selectedRepoId) {
            setSyncStatus(status);
          }
          if (!status.is_syncing && !status.isRunning) {
            setSyncingRepo(null);
            await refetch();
          } else {
            setTimeout(pollStatus, 3500);
          }
        } catch (e) {
          setSyncingRepo(null);
          await refetch();
        }
      };
      setTimeout(pollStatus, 3500);
    } catch (err) {
      alert(`Sync failed: ${err.message}`);
      setSyncingRepo(null);
    }
  };

  const handleSaveRepoSettings = async () => {
    setRepoSettingsLoading(true);
    setRepoSettingsSuccess('');
    try {
      await updateRepository(selectedRepoId, {
        business_hours_config: bhConfig,
        sync_filters: syncFilters
      });
      await refetch();
      setRepoSettingsSuccess('Settings saved and metrics recalculated successfully');
      setTimeout(() => setRepoSettingsSuccess(''), 4000);
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setRepoSettingsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
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
            {loading ? 'Verifying & Adding...' : 'Add'}
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
          <h2 className="text-lg font-semibold mb-4">Sync Information for {selectedRepo?.full_name}</h2>
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

      {selectedRepoId && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Repository Settings ({selectedRepo?.full_name})</h2>
            <button
              onClick={handleSaveRepoSettings}
              disabled={repoSettingsLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 flex items-center gap-2"
            >
              {repoSettingsLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
          
          {repoSettingsSuccess && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4" /> {repoSettingsSuccess}
            </div>
          )}

          <div className="pt-4 border-t border-slate-700">
            <h3 className="font-medium text-slate-200 mb-3">Sync Filters</h3>
            <p className="text-sm text-slate-400 mb-4">Only sync pull requests matching these criteria. Leave empty to sync all open PRs.</p>
            <div className="space-y-3">
              {syncFilters.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <select 
                    value={f.filter_type || 'author'} 
                    onChange={e => { const copy = [...syncFilters]; copy[i].filter_type = e.target.value; setSyncFilters(copy); }} 
                    className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 text-sm"
                  >
                    <option value="author">Author</option>
                    <option value="label">Label</option>
                    <option value="base_branch">Base Branch</option>
                  </select>
                  <input 
                    type="text" 
                    value={f.filter_value || ''} 
                    onChange={e => { const copy = [...syncFilters]; copy[i].filter_value = e.target.value; setSyncFilters(copy); }} 
                    placeholder="Value..." 
                    className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 flex-1 text-sm" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setSyncFilters(syncFilters.filter((_, idx) => idx !== i))} 
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button 
                type="button" 
                onClick={() => setSyncFilters([...syncFilters, { filter_type: 'author', filter_value: '' }])} 
                className="text-sm text-blue-400 flex items-center gap-1 hover:underline mt-2"
              >
                <Plus className="w-4 h-4" /> Add Filter
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-700">
            <h3 className="font-medium text-slate-200 mb-4">Business Hours Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Timezone</label>
                <select 
                  value={bhConfig.timezone || 'UTC'} 
                  onChange={e => setBhConfig({...bhConfig, timezone: e.target.value})} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                  <option value="Europe/Berlin">Central European Time (CET)</option>
                  <option value="Asia/Kolkata">India Standard Time (IST)</option>
                  <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Work Days</label>
                <div className="flex gap-2 mt-2">
                  {[
                    { v: 1, l: 'M', title: 'Monday' },
                    { v: 2, l: 'T', title: 'Tuesday' },
                    { v: 3, l: 'W', title: 'Wednesday' },
                    { v: 4, l: 'T', title: 'Thursday' },
                    { v: 5, l: 'F', title: 'Friday' },
                    { v: 6, l: 'S', title: 'Saturday' },
                    { v: 0, l: 'S', title: 'Sunday' }
                  ].map(day => {
                    const isSelected = bhConfig.workDays?.includes(day.v);
                    return (
                      <button 
                        key={day.v} 
                        type="button"
                        title={day.title}
                        onClick={() => {
                          const current = bhConfig.workDays || [];
                          const next = isSelected
                            ? current.filter(d => d !== day.v)
                            : Array.from(new Set([...current, day.v]));
                          setBhConfig({ ...bhConfig, workDays: next });
                        }}
                        className={clsx(
                          "flex items-center justify-center w-8 h-8 rounded-full border cursor-pointer select-none transition-colors", 
                          isSelected ? "bg-blue-500/20 border-blue-500 text-blue-400" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"
                        )}
                      >
                        <span className="text-xs font-semibold">{day.l}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Start Time (24h)</label>
                <input 
                  type="number" 
                  min="0" max="23" 
                  value={bhConfig.workStart ?? 9} 
                  onChange={e => setBhConfig({...bhConfig, workStart: parseInt(e.target.value) || 0})} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 text-sm" 
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">End Time (24h)</label>
                <input 
                  type="number" 
                  min="0" max="24" 
                  value={bhConfig.workEnd ?? 18} 
                  onChange={e => setBhConfig({...bhConfig, workEnd: parseInt(e.target.value) || 0})} 
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 text-sm" 
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-900/60 rounded-lg border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <div>
                <span className="text-slate-300 font-medium">Business Schedule:</span>{' '}
                {bhConfig.workDays?.length || 0} active work days/week &bull;{' '}
                {Math.max(0, (bhConfig.workEnd ?? 18) - (bhConfig.workStart ?? 9))} hrs/day &bull;{' '}
                <span className="text-blue-400 font-medium">
                  {(bhConfig.workDays?.length || 0) * Math.max(0, (bhConfig.workEnd ?? 18) - (bhConfig.workStart ?? 9))} business hrs/week
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveRepoSettings}
                disabled={repoSettingsLoading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md disabled:opacity-50 flex items-center gap-1.5 self-end sm:self-auto"
              >
                {repoSettingsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
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
