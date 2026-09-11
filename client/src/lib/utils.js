import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export function formatDuration(hours) {
  if (hours == null || isNaN(hours)) return '-';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dayjs(dateStr).format('MMM D, h:mm A');
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  return dayjs(dateStr).format('MMM D');
}

export function timeAgo(dateStr) {
  if (!dateStr) return '-';
  return dayjs(dateStr).fromNow();
}

export function getAgingColor(status) {
  const colors = {
    healthy: 'text-green-400',
    attention: 'text-yellow-400',
    aging: 'text-orange-400',
    critical: 'text-red-400',
    closed: 'text-slate-400',
  };
  return colors[status] || 'text-slate-400';
}

export function getAgingBg(status) {
  const colors = {
    healthy: 'bg-green-500/10 text-green-400 border-green-500/20',
    attention: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    aging: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
    closed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return colors[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export function getResponsibilityColor(state) {
  const colors = {
    WAITING_FOR_REVIEW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    CHANGES_REQUESTED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    APPROVED_WAITING_MERGE: 'bg-green-500/10 text-green-400 border-green-500/20',
    DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    NO_REVIEWER: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    STALE: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    MERGED: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    CLOSED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return colors[state] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export function getResponsibilityLabel(state) {
  const labels = {
    WAITING_FOR_REVIEW: 'Waiting for Review',
    CHANGES_REQUESTED: 'Changes Requested',
    APPROVED_WAITING_MERGE: 'Approved',
    DRAFT: 'Draft',
    NO_REVIEWER: 'No Reviewer',
    STALE: 'Stale',
    MERGED: 'Merged',
    CLOSED: 'Closed',
  };
  return labels[state] || state || 'Unknown';
}

export function hoursSince(dateStr) {
  if (!dateStr) return 0;
  return dayjs().diff(dayjs(dateStr), 'hour', true);
}
