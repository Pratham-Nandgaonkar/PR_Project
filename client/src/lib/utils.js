import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCcw,
  MessageSquare,
  Clock,
  GitMerge,
  GitPullRequest
} from 'lucide-react';

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

export function getHealthColor(status) {
  const colors = {
    on_track: 'text-green-400',
    needs_attention: 'text-yellow-400',
    at_risk: 'text-orange-400',
    critical: 'text-red-400',
    closed: 'text-slate-400',
  };
  return colors[status] || 'text-slate-400';
}

export function getHealthBg(status) {
  const colors = {
    on_track: 'bg-green-500/10 text-green-400 border-green-500/20',
    needs_attention: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    at_risk: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
    closed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return colors[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export function getHealthLabel(status) {
  const labels = {
    on_track: 'On Track',
    needs_attention: 'Needs Attention',
    at_risk: 'At Risk',
    critical: 'Critical',
    closed: 'Closed',
  };
  return labels[status] || status || 'Unknown';
}

export function getActionItemIcon(type) {
  switch (type) {
    case 'NEEDS_INITIAL_REVIEW': return Clock;
    case 'NEEDS_RE_REVIEW': return RotateCcw;
    case 'ADDRESS_COMMENTS': return MessageSquare;
    case 'FIX_CI': return XCircle;
    case 'RESOLVE_CONFLICTS': return AlertCircle;
    case 'MERGE_READY': return GitMerge;
    default: return GitPullRequest;
  }
}

export function getActionItemLabel(type) {
  const labels = {
    NEEDS_INITIAL_REVIEW: 'Needs Initial Review',
    NEEDS_RE_REVIEW: 'Needs Re-review',
    ADDRESS_COMMENTS: 'Address Comments',
    FIX_CI: 'Fix CI',
    RESOLVE_CONFLICTS: 'Resolve Conflicts',
    MERGE_READY: 'Ready to Merge',
  };
  return labels[type] || type;
}

export function getActionItemColor(type) {
  switch (type) {
    case 'FIX_CI':
    case 'RESOLVE_CONFLICTS':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'ADDRESS_COMMENTS':
    case 'NEEDS_RE_REVIEW':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    case 'NEEDS_INITIAL_REVIEW':
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    case 'MERGE_READY':
      return 'text-green-400 bg-green-500/10 border-green-500/20';
    default:
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  }
}

export function hoursSince(dateStr) {
  if (!dateStr) return 0;
  return dayjs().diff(dayjs(dateStr), 'hour', true);
}
