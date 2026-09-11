import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchPRs } from '../lib/api';
import { formatDuration, hoursSince, getAgingBg, getResponsibilityColor, getResponsibilityLabel, timeAgo } from '../lib/utils';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export default function PRList() {
  const { selectedRepoId } = useRepository();
  const [filters, setFilters] = useState({
    state: 'open',
    aging: '',
    responsibility: '',
    search: '',
    sort: 'created_at',
    order: 'desc',
    page: 1,
    limit: 25
  });

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 500);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const queryParams = { ...filters, search: debouncedSearch };

  const { data, loading } = useFetch(
    () => selectedRepoId ? fetchPRs(selectedRepoId, queryParams) : Promise.resolve({ data: [], total: 0 }),
    [selectedRepoId, filters.state, filters.aging, filters.responsibility, debouncedSearch, filters.sort, filters.order, filters.page, filters.limit]
  );

  if (!selectedRepoId) {
    return <div className="text-slate-400 mt-10 text-center">No pull requests found. Sync a repository first.</div>;
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const totalPages = data ? Math.ceil(data.total / filters.limit) : 1;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col xl:flex-row justify-between gap-4 xl:items-center">
        <h1 className="text-2xl font-bold">Pull Requests</h1>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search PRs..."
              className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-slate-200 w-64"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
          <select
            className="bg-slate-800 border border-slate-700 rounded-lg text-sm px-3 py-2 text-slate-200 outline-none focus:border-blue-500"
            value={`${filters.sort}-${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split('-');
              setFilters(prev => ({ ...prev, sort, order, page: 1 }));
            }}
          >
            <option value="created_at-desc">Newest</option>
            <option value="created_at-asc">Oldest</option>
            <option value="waiting_hours-desc">Most Waiting</option>
            <option value="last_activity_at-desc">Last Active</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
        <div className="flex gap-2">
          {['all', 'open', 'closed'].map(state => (
            <button
              key={state}
              onClick={() => handleFilterChange('state', state)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', filters.state === state ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50')}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Aging:</span>
            {['', 'healthy', 'attention', 'aging', 'critical'].map(age => (
              <button
                key={age || 'all'}
                onClick={() => handleFilterChange('aging', age)}
                className={clsx('px-2 py-1 rounded-md transition-colors', filters.aging === age ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200')}
              >
                {age ? age.charAt(0).toUpperCase() + age.slice(1) : 'All'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
            <span className="text-slate-400">Resp:</span>
            {['', 'WAITING_FOR_REVIEW', 'WAITING_FOR_AUTHOR', 'CHANGES_REQUESTED'].map(resp => (
              <button
                key={resp || 'all'}
                onClick={() => handleFilterChange('responsibility', resp)}
                className={clsx('px-2 py-1 rounded-md transition-colors', filters.responsibility === resp ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200')}
              >
                {resp ? getResponsibilityLabel(resp) : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden relative min-h-[400px]">
        {loading && <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10">Loading...</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium w-full max-w-[300px]">Title</th>
                <th className="px-5 py-3 font-medium">Author</th>
                <th className="px-5 py-3 font-medium">Age</th>
                <th className="px-5 py-3 font-medium">Health</th>
                <th className="px-5 py-3 font-medium">Blocker</th>
                <th className="px-5 py-3 font-medium">Waiting</th>
                <th className="px-5 py-3 font-medium">Cycles</th>
                <th className="px-5 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data?.data.map(pr => (
                <tr key={pr.number} className={clsx("hover:bg-slate-700/30 transition-colors", 
                  pr.aging_status === 'critical' ? 'border-l-4 border-l-red-500' :
                  pr.aging_status === 'aging' ? 'border-l-4 border-l-orange-500' : ''
                )}>
                  <td className="px-5 py-4">
                    <Link to={`/prs/${pr.number}`} className="text-blue-400 hover:underline">#{pr.number}</Link>
                  </td>
                  <td className="px-5 py-4 max-w-[300px] truncate text-slate-200" title={pr.title}>{pr.title}</td>
                  <td className="px-5 py-4 text-slate-300">{pr.author_login}</td>
                  <td className="px-5 py-4 text-slate-400">{formatDuration(hoursSince(pr.created_at))}</td>
                  <td className="px-5 py-4">
                    <span className={clsx("px-2 py-1 rounded-full text-xs border", getAgingBg(pr.aging_status))}>
                      {pr.aging_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={clsx("px-2 py-1 rounded-full text-xs border w-max", getResponsibilityColor(pr.responsibility_state))}>
                        {getResponsibilityLabel(pr.responsibility_state)}
                      </span>
                      {pr.responsible_login && <span className="text-xs text-slate-400">{pr.responsible_login}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-300 font-medium">{formatDuration(hoursSince(pr.responsibility_started_at))}</td>
                  <td className="px-5 py-4 text-slate-400">{pr.review_cycles_count || 0}</td>
                  <td className="px-5 py-4 text-slate-400">{timeAgo(pr.last_activity_at)}</td>
                </tr>
              ))}
              {data?.data.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" className="px-5 py-12 text-center text-slate-400">No pull requests match the criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
            <div>Showing page {filters.page} of {totalPages}</div>
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
                disabled={filters.page === 1}
                className="px-3 py-1.5 bg-slate-700 rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </button>
              <button
                onClick={() => handleFilterChange('page', Math.min(totalPages, filters.page + 1))}
                disabled={filters.page === totalPages}
                className="px-3 py-1.5 bg-slate-700 rounded-md hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
