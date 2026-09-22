import React from 'react';
import { useParams } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { useFetch } from '../hooks/useFetch';
import { fetchPRDetail } from '../lib/api';
import { formatDuration, hoursSince, formatDate, getHealthBg, getHealthLabel, getActionItemIcon, getActionItemLabel, getActionItemColor, timeAgo } from '../lib/utils';
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

  const { pr, events, reviewCycles, timeline } = data;
  const actionItems = data.actionItems || [];
  const reviewers = data.reviewers || [];
  const checks = data.checks || [];
  const commentThreads = data.commentThreads || [];
  
  // Use timeline if events isn't fully structured as we need
  const displayEvents = timeline || events || [];

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
          <div className="text-xl font-semibold">{pr.business_hours_age != null ? formatDuration(pr.business_hours_age) : formatDuration(hoursSince(pr.created_at))}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Status</div>
          <div className="mt-1">
            <span className={clsx("px-2.5 py-1 rounded-full text-xs font-medium border", getHealthBg(pr.health_status))}>
              {getHealthLabel(pr.health_status)}
            </span>
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 overflow-hidden">
          <div className="text-slate-400 text-sm mb-1">Pending On</div>
          <div className="text-sm font-medium mt-1 truncate" title={pr.pending_on_summary}>{pr.pending_on_summary || 'None'}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Waiting</div>
          <div className="text-xl font-semibold">{pr.business_hours_waiting != null ? formatDuration(pr.business_hours_waiting) : '-'}</div>
        </div>
      </div>

      {actionItems && actionItems.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold mb-4">Action Items</h2>
          <div className="space-y-3">
            {actionItems.map((item, i) => {
              const Icon = getActionItemIcon(item.action_type);
              return (
                <div key={i} className={clsx("flex items-center gap-3 p-3 rounded-lg border", getActionItemColor(item.action_type))}>
                  <Icon className="w-5 h-5" />
                  <div>
                    <div className="font-semibold">{getActionItemLabel(item.action_type)}</div>
                    <div className="text-sm opacity-80">{item.description}</div>
                  </div>
                  <div className="ml-auto text-xs opacity-70">
                    Waiting since {formatDate(item.waiting_since)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4 border-b border-slate-700 pb-2">PR Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
          <div><span className="text-slate-400 w-32 inline-block">Author:</span> <span className="font-medium text-slate-200">{pr.author_login}</span></div>
          <div><span className="text-slate-400 w-32 inline-block">Created:</span> <span className="text-slate-200">{formatDate(pr.created_at)} ({timeAgo(pr.created_at)})</span></div>
          <div><span className="text-slate-400 w-32 inline-block">Branches:</span> <span className="text-slate-300 font-mono text-xs">{pr.base_ref}</span> &larr; <span className="text-slate-300 font-mono text-xs">{pr.head_ref}</span></div>
          <div>
            <span className="text-slate-400 w-32 inline-block">Changes:</span> 
            <span className="text-green-400">+{pr.additions}</span> <span className="text-red-400">-{pr.deletions}</span> in {pr.changed_files_count} files ({pr.commits_count} commits)
          </div>
          <div><span className="text-slate-400 w-32 inline-block">Review Cycles:</span> <span className="text-slate-200">{pr.review_cycles_count || 0}</span></div>
          <div>
            <span className="text-slate-400 w-32 inline-block">Assignees:</span> 
            <span className="text-slate-200">{pr.assignees?.join(', ') || 'None'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reviewers && reviewers.length > 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h2 className="text-lg font-semibold mb-4">Reviewers</h2>
            <div className="grid grid-cols-1 gap-3">
              {reviewers.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-200">{r.reviewer_login}</span>
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full w-max mt-1 border", 
                      r.review_state === 'APPROVED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      r.review_state === 'CHANGES_REQUESTED' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    )}>
                      {r.review_state}
                      {r.re_review_needed && ' (Re-review needed)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {checks && checks.length > 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <h2 className="text-lg font-semibold mb-4">CI Checks</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {checks.map((c, i) => (
                <div key={i} className="flex justify-between items-center p-2 rounded bg-slate-900/50">
                  <span className="text-slate-300 truncate mr-2" title={c.check_name}>{c.check_name}</span>
                  <span className={clsx("text-xs px-2 py-0.5 rounded-full border whitespace-nowrap",
                    c.conclusion === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    c.conclusion === 'failure' || c.conclusion === 'timed_out' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                  )}>
                    {c.conclusion || c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {commentThreads && commentThreads.some(c => !c.is_resolved) && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-lg font-semibold mb-4">Unresolved Comments</h2>
          <div className="space-y-3">
            {commentThreads.filter(c => !c.is_resolved).map((c, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-slate-200">{c.author_login}</span>
                  <span className="text-slate-500">{formatDate(c.created_at)}</span>
                </div>
                <div className="text-slate-300 text-sm whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {cycle.review_state ? (
                      <span className={clsx("px-2 py-1 rounded-full text-xs", cycle.review_state === 'APPROVED' ? 'bg-green-500/10 text-green-400' : cycle.review_state === 'CHANGES_REQUESTED' ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-500/10 text-slate-400')}>
                        {cycle.review_state}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">{cycle.reviewer_response_hours != null ? formatDuration(cycle.reviewer_response_hours) : '-'}</td>
                  <td className="px-4 py-3">{cycle.author_response_hours != null ? formatDuration(cycle.author_response_hours) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-6">Timeline</h2>
        <div className="relative pl-6 border-l-2 border-slate-700 space-y-6 ml-3">
          {displayEvents?.map((event, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[35px] bg-slate-800 rounded-full p-1 border border-slate-700">
                <EventIcon type={event.type || event.event_type} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                <span className="font-semibold text-slate-200">{event.actor || event.actor_login}</span>
                <span className="text-slate-400">{event.description}</span>
                <span className="text-xs text-slate-500 sm:ml-auto">{formatDate(event.timestamp || event.event_time)} ({timeAgo(event.timestamp || event.event_time)})</span>
              </div>
              {(event.data?.body || event.body_snippet) && (
                <div className="mt-2 text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 italic whitespace-pre-wrap">
                  "{event.data?.body || event.body_snippet}"
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
