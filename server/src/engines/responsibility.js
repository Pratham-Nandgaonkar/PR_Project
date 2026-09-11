const dayjs = require('dayjs');

function determineResponsibility(pr, reviews, events) {
  const now = dayjs();
  
  // Closed states
  if (pr.state === 'closed' && pr.is_merged) {
    return {
      state: 'MERGED',
      responsibleLogin: null,
      reason: `PR was merged${pr.merged_at ? ' on ' + dayjs(pr.merged_at).format('MMM D, YYYY [at] h:mm A') : ''}.`,
      startedAt: pr.merged_at || pr.closed_at,
      waitingDuration: 0,
    };
  }
  if (pr.state === 'closed') {
    return {
      state: 'CLOSED',
      responsibleLogin: null,
      reason: 'PR was closed without merging.',
      startedAt: pr.closed_at,
      waitingDuration: 0,
    };
  }

  // Draft
  if (pr.is_draft) {
    return {
      state: 'DRAFT',
      responsibleLogin: pr.author_login,
      reason: `PR is in draft state. ${pr.author_login} needs to mark it ready for review.`,
      startedAt: pr.created_at,
      waitingDuration: now.diff(dayjs(pr.created_at), 'hour', true),
    };
  }

  // Parse requested_reviewers (could be JSON string or array)
  let requestedReviewers = pr.requested_reviewers || [];
  if (typeof requestedReviewers === 'string') {
    try { requestedReviewers = JSON.parse(requestedReviewers); } catch { requestedReviewers = []; }
  }

  // Sort reviews by submitted_at descending
  const sortedReviews = [...(reviews || [])].sort(
    (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)
  );

  // Get latest meaningful review (APPROVED or CHANGES_REQUESTED)
  const meaningfulStates = ['APPROVED', 'CHANGES_REQUESTED'];
  const latestMeaningful = sortedReviews.find(r => meaningfulStates.includes(r.state));

  // Get author actions (commits, force pushes) sorted by date desc
  const authorActions = (events || []).filter(
    e => (e.event_type === 'committed' || e.event_type === 'head_ref_force_pushed') &&
      (e.actor_login === pr.author_login || !e.actor_login)
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (latestMeaningful) {
    const reviewDate = dayjs(latestMeaningful.submitted_at);
    
    // Find author actions AFTER this review
    const authorActionAfterReview = authorActions.find(
      a => dayjs(a.created_at).isAfter(reviewDate)
    );

    if (latestMeaningful.state === 'CHANGES_REQUESTED') {
      if (authorActionAfterReview) {
        // Author responded, waiting for reviewer to re-review
        const startedAt = authorActionAfterReview.created_at;
        return {
          state: 'WAITING_FOR_REVIEW',
          responsibleLogin: latestMeaningful.reviewer_login,
          reason: `${pr.author_login} pushed changes on ${dayjs(startedAt).format('MMM D [at] h:mm A')} after ${latestMeaningful.reviewer_login} requested changes on ${reviewDate.format('MMM D [at] h:mm A')}. Waiting for ${latestMeaningful.reviewer_login} to re-review.`,
          startedAt,
          waitingDuration: now.diff(dayjs(startedAt), 'hour', true),
        };
      } else {
        // Author has not responded
        return {
          state: 'CHANGES_REQUESTED',
          responsibleLogin: pr.author_login,
          reason: `${latestMeaningful.reviewer_login} requested changes on ${reviewDate.format('MMM D [at] h:mm A')}. ${pr.author_login} has not pushed updates since then.`,
          startedAt: latestMeaningful.submitted_at,
          waitingDuration: now.diff(reviewDate, 'hour', true),
        };
      }
    }

    if (latestMeaningful.state === 'APPROVED') {
      // Check for pending reviewers who haven't approved
      const approvedReviewers = new Set(
        sortedReviews.filter(r => r.state === 'APPROVED').map(r => r.reviewer_login)
      );
      const pendingReviewers = requestedReviewers.filter(
        login => !approvedReviewers.has(login)
      );

      if (pendingReviewers.length > 0) {
        return {
          state: 'WAITING_FOR_REVIEW',
          responsibleLogin: pendingReviewers[0],
          reason: `Approved by ${latestMeaningful.reviewer_login}, but still waiting for review from: ${pendingReviewers.join(', ')}.`,
          startedAt: latestMeaningful.submitted_at,
          waitingDuration: now.diff(reviewDate, 'hour', true),
        };
      }

      return {
        state: 'APPROVED_WAITING_MERGE',
        responsibleLogin: pr.author_login,
        reason: `PR is approved. Waiting for ${pr.author_login} to merge.`,
        startedAt: latestMeaningful.submitted_at,
        waitingDuration: now.diff(reviewDate, 'hour', true),
      };
    }
  }

  // No meaningful review exists
  if (requestedReviewers.length > 0) {
    // Find when review was requested
    const reviewRequestEvent = [...(events || [])]
      .filter(e => e.event_type === 'review_requested')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const startedAt = reviewRequestEvent?.created_at || pr.created_at;

    return {
      state: 'WAITING_FOR_REVIEW',
      responsibleLogin: requestedReviewers[0],
      reason: `Review requested from ${requestedReviewers.join(', ')} but no review has been submitted yet.`,
      startedAt,
      waitingDuration: now.diff(dayjs(startedAt), 'hour', true),
    };
  }

  // No reviewer requested
  return {
    state: 'NO_REVIEWER',
    responsibleLogin: pr.author_login,
    reason: 'No reviewer has been requested. Author should request a review.',
    startedAt: pr.created_at,
    waitingDuration: now.diff(dayjs(pr.created_at), 'hour', true),
  };
}

// Check for staleness - call this after determineResponsibility
function checkStaleness(result, pr, events) {
  const now = dayjs();
  const allDates = [
    pr.updated_at,
    ...(events || []).map(e => e.created_at),
  ].filter(Boolean).map(d => dayjs(d));
  
  
  let maxDate = dayjs(pr.created_at);
  for (const d of allDates) {
    if (d.isAfter(maxDate)) maxDate = d;
  }
  
  if (now.diff(maxDate, 'day') >= 14 && !['MERGED', 'CLOSED'].includes(result.state)) {
    return {
      ...result,
      state: 'STALE',
      reason: `${result.reason} No activity for ${now.diff(maxDate, 'day')} days. PR appears stale.`,
    };
  }
  return result;
}

module.exports = { determineResponsibility, checkStaleness };
