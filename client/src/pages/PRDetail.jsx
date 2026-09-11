import React from 'react';
import { useParams } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchPRDetail } from '../lib/api';
import { formatDuration, hoursSince, formatDate, getAgingBg, getResponsibilityColor, getResponsibilityLabel, timeAgo } from '../lib/utils';
import { ExternalLink, GitPullRequest, GitMerge, XCircle, MessageSquare, Check, RotateCcw, User } from 'lucide-react';
import clsx from 'clsx';

export default function PRDetail() {
  const { number } = useParams();
  const { selectedRepo, selectedRepoId } = useRepository();

  const { data, loading, error } = useFetch(
    () => selectedRepoId ? fetchPRDetail(selectedRepoId, number) : Promise.reject(new Error('No repo')),
    [selectedRepoId, number]
  );

  if (loading) return <div className="p-8 text-center text-slate-400">Loading PR details...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-400">Error loading PR: {error}</div>;

  const { pr, events, reviewCycles } = data;

  const EventIcon = ({ type }) => {
    switch (type) {
      case 'merged': return <GitMerge className="w-4 h-4 text-purple-400" />;
      case 'closed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'APPROVED': return <Check className="w-4 h-4 text-green-400" />;
      case 'CHANGES_REQUESTED': return <RotateCcw className="w-4 h-4 text-orange-400" />;
      case 'COMMENTED': case 'review': return <MessageSquare className="w-4 h-4 text-slate-400" />;
      case 'review_requested': return <User className="w-4 h-4 text-blue-400" />;
      case 'pr_created': return <GitPullRequest className="w-4 h-4 text-blue-400" />;
      default: return <div className="w-2 h-2 rounded-full bg-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-100">{pr.title}</h1>
          <span className="text-2xl text-slate-500">#{pr.number}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className={clsx("px-3 py-1 rounded-full border", pr.state === 'closed' ? (pr.merged_at ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20') : 'bg-green-500/10 text-green-400 border-green-500/20')}>
            {pr.state === 'closed' ? (pr.merged_at ? 'Merged' : 'Closed') : 'Open'}
          </span>
          <a
            href={`https://github.com/${selectedRepo?.full_name}/pull/${pr.number}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-400 hover:underline"
          >
            View on GitHub <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Age</div>
          <div className="text-xl font-semibold">{formatDuration(hoursSince(pr.created_at))}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Status</div>
          <div className="mt-1">
            <span className={clsx("px-2.5 py-1 rounded-full text-xs font-medium border", getResponsibilityColor(pr.responsibility_state))}>
              {getResponsibilityLabel(pr.responsibility_state)}
            </span>
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Responsible</div>
          <div className="text-lg font-medium">{pr.responsible_login || 'None'}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Waiting</div>
          <div className="text-xl font-semibold">{formatDuration(hoursSince(pr.responsibility_started_at))}</div>
        </div>
      </div>

      <div className={clsx("bg-slate-800 rounded-xl p-5 border-l-4 shadow-lg", 
        pr.aging_status === 'critical' ? 'border-l-red-500' :
        pr.aging_status === 'aging' ? 'border-l-orange-500' :
        pr.aging_status === 'attention' ? 'border-l-yellow-500' : 'border-l-green-500'
      )}>
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          Current Status <span className={clsx("text-xs px-2 py-0.5 rounded-full", getAgingBg(pr.aging_status))}>{pr.aging_status.toUpperCase()}</span>
        </h2>
        <p className="text-slate-300 text-lg leading-relaxed">{pr.responsibility_reason}</p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4 border-b border-slate-700 pb-2">PR Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
          <div><span className="text-slate-400 w-32 inline-block">Author:</span> <span className="font-medium text-slate-200">{pr.author_login}</span></div>
          <div><span className="text-slate-400 w-32 inline-block">Created:</span> <span className="text-slate-200">{formatDate(pr.created_at)} ({timeAgo(pr.created_at)})</span></div>
          <div><span className="text-slate-400 w-32 inline-block">Branches:</span> <span className="text-slate-300 font-mono text-xs">{pr.base_branch}</span> &larr; <span className="text-slate-300 font-mono text-xs">{pr.head_branch}</span></div>
          <div>
            <span className="text-slate-400 w-32 inline-block">Changes:</span> 
            <span className="text-green-400">+{pr.additions}</span> <span className="text-red-400">-{pr.deletions}</span> in {pr.changed_files} files ({pr.commits_count} commits)
          </div>
          <div><span className="text-slate-400 w-32 inline-block">Review Cycles:</span> <span className="text-slate-200">{pr.review_cycles_count || 0}</span></div>
          <div>
            <span className="text-slate-400 w-32 inline-block">Assignees:</span> 
            <span className="text-slate-200">{pr.assignees?.join(', ') || 'None'}</span>
          </div>
        </div>
      </div>

      {reviewCycles && reviewCycles.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">Review Cycles</h2>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-4 py-2">Cycle</th>
                <th className="px-4 py-2">Reviewer</th>
                <th className="px-4 py-2">Outcome</th>
                <th className="px-4 py-2">Reviewer Response Time</th>
                <th className="px-4 py-2">Author Response Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {reviewCycles.map((cycle, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="px-4 py-3">{cycle.cycle_number}</td>
                  <td className="px-4 py-3">{cycle.reviewer_login}</td>
                  <td className="px-4 py-3">
                    {cycle.outcome ? (
                      <span className={clsx("px-2 py-1 rounded-full text-xs", cycle.outcome === 'APPROVED' ? 'bg-green-500/10 text-green-400' : cycle.outcome === 'CHANGES_REQUESTED' ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-500/10 text-slate-400')}>
                        {cycle.outcome}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">{formatDuration(cycle.reviewer_response_time_hours)}</td>
                  <td className="px-4 py-3">{formatDuration(cycle.author_response_time_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-6">Timeline</h2>
        <div className="relative pl-6 border-l-2 border-slate-700 space-y-6 ml-3">
          {events?.map((event, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[35px] bg-slate-800 rounded-full p-1 border border-slate-700">
                <EventIcon type={event.event_type} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                <span className="font-semibold text-slate-200">{event.actor_login}</span>
                <span className="text-slate-400">{event.description}</span>
                <span className="text-xs text-slate-500 sm:ml-auto">{formatDate(event.event_time)} ({timeAgo(event.event_time)})</span>
              </div>
              {event.body_snippet && (
                <div className="mt-2 text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 italic">
                  "{event.body_snippet}"
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
