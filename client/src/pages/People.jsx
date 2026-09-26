import React, { useState } from 'react';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchPeople } from '../lib/api';
import { formatDuration } from '../lib/utils';
import clsx from 'clsx';

export default function People() {
  const { selectedRepoId } = useRepository();
  const [tab, setTab] = useState('reviewers'); // 'reviewers' or 'authors'

  const { data, loading } = useFetch(
    () => selectedRepoId ? fetchPeople(selectedRepoId) : Promise.resolve({ reviewers: [], authors: [] }),
    [selectedRepoId]
  );

  const isUpdating = loading && !!data;

  if (!selectedRepoId) {
    return <div className="text-slate-400 mt-10 text-center">No people data. Sync a repository first.</div>;
  }

  if (loading && !data) {
    return <div className="text-slate-400 mt-10 text-center">Loading people analytics...</div>;
  }

  const { reviewers = [], authors = [] } = data || {};

  // Sort reviewers by pending desc
  const sortedReviewers = [...reviewers].sort((a, b) => b.pending_reviews - a.pending_reviews);
  // Sort authors by open desc
  const sortedAuthors = [...authors].sort((a, b) => b.open_prs - a.open_prs);

  const getAvatarColor = (name) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={clsx("space-y-6 transition-opacity duration-200", isUpdating && "opacity-60")}>
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">People Analytics</h1>
          {isUpdating && (
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              Updating...
            </div>
          )}
        </div>
        <div className="bg-slate-800 p-1 rounded-lg flex border border-slate-700">
          <button
            className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors', tab === 'reviewers' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white')}
            onClick={() => setTab('reviewers')}
          >
            Reviewers
          </button>
          <button
            className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors', tab === 'authors' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white')}
            onClick={() => setTab('authors')}
          >
            Authors
          </button>
        </div>
      </div>

      {tab === 'reviewers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedReviewers.map(r => (
            <div key={r.login} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors">
              <div className="flex items-center gap-4 mb-6">
                <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white", getAvatarColor(r.login))}>
                  {r.login.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-200">{r.login}</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className={clsx("p-3 rounded-lg", r.pending_reviews > 0 ? "bg-orange-500/10 border border-orange-500/20" : "bg-slate-900/50 border border-slate-700/50")}>
                  <div className="text-xs text-slate-400 mb-1">Pending Reviews</div>
                  <div className={clsx("text-2xl font-bold", r.pending_reviews > 0 ? "text-orange-400" : "text-slate-200")}>{r.pending_reviews}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Completed</div>
                  <div className="text-2xl font-bold text-slate-200">{r.reviews_completed}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Approvals</div>
                  <div className="text-lg font-bold text-green-400">{r.approvals}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Changes Req</div>
                  <div className="text-lg font-bold text-yellow-400">{r.changes_requested}</div>
                </div>
                <div className="col-span-2 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex justify-between items-center">
                  <div className="text-xs text-slate-400">Longest Pending</div>
                  <div className="font-medium text-slate-300">{formatDuration(r.longest_pending_hours)}</div>
                </div>
              </div>
            </div>
          ))}
          {sortedReviewers.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">No reviewer data available.</div>}
        </div>
      )}

      {tab === 'authors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedAuthors.map(a => (
            <div key={a.login} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors">
              <div className="flex items-center gap-4 mb-6">
                <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white", getAvatarColor(a.login))}>
                  {a.login.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-200">{a.login}</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Open PRs</div>
                  <div className="text-2xl font-bold text-blue-400">{a.open_prs}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Total PRs</div>
                  <div className="text-2xl font-bold text-slate-200">{a.total_prs}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Avg PR Age</div>
                  <div className="text-lg font-bold text-slate-300">{formatDuration(a.avg_pr_age_hours)}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Avg Cycles</div>
                  <div className="text-lg font-bold text-slate-300">{Number(a.avg_review_cycles).toFixed(1)}</div>
                </div>
              </div>
            </div>
          ))}
          {sortedAuthors.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">No author data available.</div>}
        </div>
      )}
    </div>
  );
}
