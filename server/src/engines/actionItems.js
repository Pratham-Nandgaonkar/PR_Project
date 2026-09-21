const { calculateBusinessHours } = require('./businessHours');

function determineActionItems(pr, reviewers, commentThreads, checks, businessHoursConfig) {
  if (pr.state === 'closed') {
    return {
      actionItems: [],
      pendingOnSummary: pr.is_merged ? 'Merged' : 'Closed',
    };
  }

  const actionItems = [];
  let pendingSummaryParts = [];

  // 1. Check CI Status
  const failingChecks = checks.filter(c => c.conclusion === 'failure' || c.conclusion === 'timed_out');
  if (failingChecks.length > 0) {
    actionItems.push({
      action_type: 'FIX_CI',
      assignee_login: pr.author_login,
      description: `Author — ${failingChecks.length} CI checks failing`,
      priority: 'HIGH',
      waiting_since: failingChecks[0].completed_at || new Date(),
    });
    pendingSummaryParts.push(`CI failed`);
  }

  // 2. Check Merge Conflicts (assuming passed in PR data somehow, or via API)
  if (pr.has_merge_conflicts) {
    actionItems.push({
      action_type: 'RESOLVE_CONFLICTS',
      assignee_login: pr.author_login,
      description: `Author — merge conflicts need resolution`,
      priority: 'HIGH',
      waiting_since: new Date(),
    });
    pendingSummaryParts.push(`conflicts`);
  }

  // 3. Reviewer States
  if (!pr.is_draft) {
    const pendingReviewers = reviewers.filter(r => r.review_state === 'PENDING' && !r.re_review_needed);
    const reReviewNeeded = reviewers.filter(r => r.re_review_needed);
    const changesRequested = reviewers.filter(r => r.review_state === 'CHANGES_REQUESTED' && !r.re_review_needed);

    // Initial Reviews needed
    for (const rev of pendingReviewers) {
      actionItems.push({
        action_type: 'NEEDS_INITIAL_REVIEW',
        assignee_login: rev.reviewer_login,
        description: `@${rev.reviewer_login} — initial review`,
        priority: 'NORMAL',
        waiting_since: rev.assigned_at || pr.created_at,
      });
      pendingSummaryParts.push(`@${rev.reviewer_login} (review)`);
    }

    // Re-reviews needed (Author pushed fixes)
    for (const rev of reReviewNeeded) {
      actionItems.push({
        action_type: 'NEEDS_RE_REVIEW',
        assignee_login: rev.reviewer_login,
        description: `@${rev.reviewer_login} — re-review (author pushed fixes)`,
        priority: 'HIGH',
        waiting_since: rev.latest_reviewed_at || new Date(),
      });
      pendingSummaryParts.push(`@${rev.reviewer_login} (re-review)`);
    }

    // Author needs to push changes
    if (changesRequested.length > 0) {
      actionItems.push({
        action_type: 'PUSH_CHANGES',
        assignee_login: pr.author_login,
        description: `Author — changes requested by ${changesRequested.map(r => '@'+r.reviewer_login).join(', ')}`,
        priority: 'HIGH',
        waiting_since: changesRequested[0].latest_reviewed_at || new Date(),
      });
      pendingSummaryParts.push(`Author (changes)`);
    }
  }

  // 4. Unresolved Comments
  const unresolvedBlocking = commentThreads.filter(c => !c.is_resolved && (c.classification === 'blocking' || c.classification === 'question'));
  if (unresolvedBlocking.length > 0) {
    actionItems.push({
      action_type: 'ADDRESS_COMMENTS',
      assignee_login: pr.author_login,
      description: `Author — ${unresolvedBlocking.length} unresolved threads`,
      priority: 'NORMAL',
      waiting_since: unresolvedBlocking[0].created_at || new Date(),
    });
    if (!pendingSummaryParts.some(p => p.includes('Author'))) {
      pendingSummaryParts.push(`Author (comments)`);
    }
  }

  // 5. Merge Ready
  const approvals = reviewers.filter(r => r.review_state === 'APPROVED' && !r.re_review_needed);
  if (
    !pr.is_draft &&
    actionItems.length === 0 && 
    approvals.length > 0
  ) {
    actionItems.push({
      action_type: 'MERGE_READY',
      assignee_login: pr.author_login,
      description: `Ready to merge ✅`,
      priority: 'LOW',
      waiting_since: approvals[approvals.length-1].latest_reviewed_at || new Date(),
    });
    pendingSummaryParts = ['Ready to merge'];
  } else if (!pr.is_draft && reviewers.length === 0 && actionItems.length === 0) {
    actionItems.push({
      action_type: 'NEEDS_INITIAL_REVIEW',
      assignee_login: pr.author_login,
      description: `Author — needs to assign a reviewer`,
      priority: 'NORMAL',
      waiting_since: pr.created_at,
    });
    pendingSummaryParts = ['Author (assign reviewer)'];
  }

  // Calculate business hours for each item
  for (const item of actionItems) {
    item.waiting_biz_hours = calculateBusinessHours(item.waiting_since, new Date(), businessHoursConfig);
  }

  return {
    actionItems,
    pendingOnSummary: pendingSummaryParts.join(', ') || 'No blockers'
  };
}

module.exports = { determineActionItems };
