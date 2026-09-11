const dayjs = require('dayjs');

function classifyAging(pr, responsibility) {
  if (pr.state !== 'open') {
    return { status: 'closed', reason: 'PR is not open' };
  }

  const now = dayjs();
  const ageHours = now.diff(dayjs(pr.created_at), 'hour', true);
  const waitHours = responsibility?.waitingDuration || 0;
  const reviewCycles = pr.review_cycles_count || 0;

  if (pr.is_draft) {
    if (ageHours > 168) {
      return { status: 'attention', reason: `Draft PR has been open for ${Math.round(ageHours / 24)} days` };
    }
    return { status: 'healthy', reason: 'Draft PR is in progress' };
  }

  // Critical
  if (ageHours > 168) {
    return { status: 'critical', reason: `PR has been open for ${Math.round(ageHours / 24)} days (>7 days)` };
  }
  if (waitHours > 72) {
    return { status: 'critical', reason: `Current blocker has been waiting for ${Math.round(waitHours)} hours (>72h)` };
  }
  if (reviewCycles >= 5) {
    return { status: 'critical', reason: `PR has gone through ${reviewCycles} review cycles (>=5)` };
  }

  // Aging
  if (ageHours > 72) {
    return { status: 'aging', reason: `PR has been open for ${Math.round(ageHours / 24)} days (>3 days)` };
  }
  if (waitHours > 48) {
    return { status: 'aging', reason: `Current blocker has been waiting for ${Math.round(waitHours)} hours (>48h)` };
  }
  if (reviewCycles >= 3) {
    return { status: 'aging', reason: `PR has gone through ${reviewCycles} review cycles (>=3)` };
  }

  // Attention
  if (ageHours > 24) {
    return { status: 'attention', reason: `PR has been open for ${Math.round(ageHours)} hours (>24h)` };
  }
  if (waitHours > 16) {
    return { status: 'attention', reason: `Current blocker has been waiting for ${Math.round(waitHours)} hours (>16h)` };
  }

  return { status: 'healthy', reason: 'PR is progressing normally' };
}

module.exports = { classifyAging };
