import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchPRs } from '../lib/api';
import { formatDuration, hoursSince, getHealthBg, getHealthLabel, timeAgo } from '../lib/utils';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import clsx from 'clsx';

export default function PRList() {
  const { selectedRepoId } = useRepository();
  const [selectedPRReviewers, setSelectedPRReviewers] = useState(null);
  const [selectedPRWaiting, setSelectedPRWaiting] = useState(null);
  const [filters, setFilters] = useState({
    state: 'open',
    health_status: '',
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
    [selectedRepoId, filters.state, filters.health_status, debouncedSearch, filters.sort, filters.order, filters.page, filters.limit]
  );

  if (!selectedRepoId) {
    return <div className="text-slate-400 mt-10 text-center">No pull requests found. Sync a repository first.</div>;
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key !== 'page' ? { page: 1 } : {}),
    }));
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
          {['all', 'open', 'merged', 'closed'].map(state => (
            <button
              key={state}
              onClick={() => handleFilterChange('state', state)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', filters.state === state ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50')}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Health:</span>
            {['', 'on_track', 'needs_attention', 'at_risk', 'critical'].map(health => (
              <button
                key={health || 'all'}
                onClick={() => handleFilterChange('health_status', health)}
                className={clsx('px-2 py-1 rounded-md transition-colors', filters.health_status === health ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200')}
              >
                {health ? getHealthLabel(health) : 'All'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <span className="font-medium mr-1 text-slate-300">Reviewer Status:</span>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full border border-green-500 bg-green-500/20"></div> Approved</div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full border border-yellow-500 bg-yellow-500/20"></div> Changes Req</div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full border border-slate-500 bg-slate-500/20"></div> Pending / Commenting</div>
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
                <th className="px-5 py-3 font-medium">Pending On</th>
                <th className="px-5 py-3 font-medium">Waiting</th>
                <th className="px-5 py-3 font-medium">Cycles</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Reviewers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data?.data.map(pr => (
                <tr key={pr.number} className={clsx("hover:bg-slate-700/30 transition-colors", 
                  pr.health_status === 'critical' ? 'border-l-4 border-l-red-500' :
                  pr.health_status === 'at_risk' ? 'border-l-4 border-l-orange-500' : ''
                )}>
                  <td className="px-5 py-4">
                    <Link to={`/prs/${pr.number}`} className="text-blue-400 hover:underline">#{pr.number}</Link>
                  </td>
                  <td className="px-5 py-4 max-w-[300px] truncate text-slate-200" title={pr.title}>{pr.title}</td>
                  <td className="px-5 py-4 text-slate-300">{pr.author_login}</td>
                  <td className="px-5 py-4 text-slate-400">{pr.business_hours_age != null ? formatDuration(pr.business_hours_age) : formatDuration(hoursSince(pr.created_at))}</td>
                  <td className="px-5 py-4">
                    <span className={clsx("px-2 py-1 rounded-full text-xs border whitespace-nowrap", getHealthBg(pr.health_status))}>
                      {getHealthLabel(pr.health_status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {pr.pending_on_summary ? (
                      <span className="text-slate-300 text-xs bg-slate-700/50 px-2 py-1 rounded-md">{pr.pending_on_summary}</span>
                    ) : (
                      <span className="text-slate-500 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div 
                      className="cursor-pointer hover:bg-slate-700/50 p-2 -m-2 rounded-lg transition-colors"
                      onClick={() => pr.action_items?.length > 0 && setSelectedPRWaiting(pr)}
                    >
                      <div className="text-slate-300 font-medium">
                        {pr.business_hours_waiting != null ? formatDuration(pr.business_hours_waiting) : '-'}
                      </div>
                      {pr.top_action_description && (
                        <div className="text-slate-500 text-[11px] mt-1 max-w-[200px] truncate" title={pr.top_action_description}>
                          ↳ {pr.top_action_description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-400">{pr.review_cycles_count || 0}</td>
                  <td className="px-5 py-4">
                    <span className={clsx(
                      "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                      pr.state === 'closed'
                        ? pr.is_merged
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        : 'bg-green-500/10 text-green-400 border-green-500/20'
                    )}>
                      {pr.state === 'closed' ? (pr.is_merged ? 'Merged' : 'Closed') : 'Open'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div 
                      className="flex items-center -space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => pr.reviewers?.length > 0 && setSelectedPRReviewers(pr)}
                    >
                      {pr.reviewers && pr.reviewers.length > 0 ? (
                        pr.reviewers.map(r => (
                          <div 
                            key={r.reviewer_login}
                            title={`${r.reviewer_login} (${r.review_state || 'PENDING'})`}
                            className={clsx(
                              "w-7 h-7 rounded-full border border-slate-800 bg-slate-700 flex items-center justify-center overflow-hidden z-10 hover:z-20 transition-transform hover:scale-110",
                              r.review_state === 'APPROVED' && !r.re_review_needed ? 'ring-2 ring-green-500' :
                              r.review_state === 'CHANGES_REQUESTED' ? 'ring-2 ring-yellow-500' :
                              'ring-1 ring-slate-600'
                            )}
                          >
                            {r.reviewer_avatar_url ? (
                              <img src={r.reviewer_avatar_url} alt={r.reviewer_login} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-300">{r.reviewer_login.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500 text-xs pl-2">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && !loading && (
                <tr>
                  <td colSpan="10" className="px-5 py-12 text-center text-slate-400">No pull requests match the criteria.</td>
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

      {/* Reviewers Modal */}
      {selectedPRReviewers && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPRReviewers(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl sticky top-0">
              <h2 className="text-lg font-bold text-slate-200">
                Reviewers for PR #{selectedPRReviewers.number}
              </h2>
              <button onClick={() => setSelectedPRReviewers(null)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {selectedPRReviewers.reviewers?.map((r, i) => (
                <div key={r.reviewer_login} className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4 flex gap-4">
                  <div className="flex-shrink-0 relative">
                    {r.reviewer_avatar_url ? (
                      <img src={r.reviewer_avatar_url} alt={r.reviewer_login} className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm">
                        {r.reviewer_login.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={clsx(
                      "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800",
                      r.review_state === 'APPROVED' && !r.re_review_needed ? 'bg-green-500' :
                      r.review_state === 'CHANGES_REQUESTED' ? 'bg-yellow-500' :
                      'bg-slate-500'
                    )}></div>
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-semibold text-slate-200">
                        {r.reviewer_login}
                        <span className="text-slate-500 text-xs ml-2 font-normal">User {i + 1}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Assigned {timeAgo(r.assigned_at)}
                      </div>
                    </div>
                    
                    <div className="text-xs mb-2">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full",
                        r.review_state === 'APPROVED' && !r.re_review_needed ? 'bg-green-500/10 text-green-400' :
                        r.review_state === 'CHANGES_REQUESTED' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-slate-500/10 text-slate-400'
                      )}>
                        {r.review_state === 'APPROVED' && !r.re_review_needed ? 'Approved' :
                         r.review_state === 'CHANGES_REQUESTED' ? 'Changes Requested' :
                         'Pending Review'}
                      </span>
                      {r.response_time_biz_hours != null && (
                        <span className="ml-2 text-slate-400">
                          (Took {formatDuration(r.response_time_biz_hours)})
                        </span>
                      )}
                    </div>
                    
                    {r.latest_comment ? (
                      <div className="mt-2 bg-slate-800 p-3 rounded-md border border-slate-700 text-sm text-slate-300">
                        <div className="text-xs text-slate-500 mb-1 font-medium">Latest Comment:</div>
                        <div className="line-clamp-3 whitespace-pre-wrap">{r.latest_comment}</div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500 italic">No review comments yet.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Waiting Details Modal */}
      {selectedPRWaiting && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPRWaiting(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl sticky top-0">
              <h2 className="text-lg font-bold text-slate-200">
                Current Blockers for PR #{selectedPRWaiting.number}
              </h2>
              <button onClick={() => setSelectedPRWaiting(null)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {selectedPRWaiting.action_items?.map((item, i) => (
                <div key={item.id || i} className={clsx(
                  "border rounded-lg p-4 flex flex-col gap-2",
                  item.priority === 'HIGH' ? 'bg-red-500/10 border-red-500/20' :
                  item.priority === 'NORMAL' ? 'bg-orange-500/10 border-orange-500/20' :
                  'bg-slate-900/50 border-slate-700/50'
                )}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider",
                        item.priority === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                        item.priority === 'NORMAL' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-slate-700 text-slate-300'
                      )}>
                        {item.action_type.replace(/_/g, ' ')}
                      </span>
                      {item.assignee_login && (
                        <span className="text-sm font-medium text-slate-200">
                          Assigned to: {item.assignee_login}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-200">
                        {formatDuration(item.waiting_biz_hours || 0)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Waiting since {timeAgo(item.waiting_since)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm text-slate-300 bg-slate-900/40 p-3 rounded-md border border-slate-800">
                    {item.description}
                  </div>
                </div>
              ))}
              
              {selectedPRWaiting.action_items?.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                  This PR currently has no active blockers.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
