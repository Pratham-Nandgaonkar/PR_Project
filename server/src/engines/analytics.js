const dayjs = require('dayjs');

function computeSummary(prs) {
  const now = dayjs();
  const openPRs = prs.filter(p => p.state === 'open');
  const closedPRs = prs.filter(p => p.state === 'closed' && !p.is_merged);
  const mergedPRs = prs.filter(p => p.is_merged);

  const agingCounts = { healthy: 0, attention: 0, aging: 0, critical: 0 };
  openPRs.forEach(p => {
    if (agingCounts[p.aging_status] !== undefined) agingCounts[p.aging_status]++;
  });

  let waitingForAuthor = 0, waitingForReviewer = 0;
  openPRs.forEach(p => {
    if (['CHANGES_REQUESTED', 'DRAFT', 'NO_REVIEWER'].includes(p.responsibility_state)) waitingForAuthor++;
    if (['WAITING_FOR_REVIEW'].includes(p.responsibility_state)) waitingForReviewer++;
  });

  const avgAgeHours = openPRs.length > 0
    ? openPRs.reduce((sum, p) => sum + now.diff(dayjs(p.created_at), 'hour', true), 0) / openPRs.length
    : 0;

  const prsWithFirstReview = prs.filter(p => p.first_review_at);
  const avgFirstReviewHours = prsWithFirstReview.length > 0
    ? prsWithFirstReview.reduce((sum, p) => sum + dayjs(p.first_review_at).diff(dayjs(p.created_at), 'hour', true), 0) / prsWithFirstReview.length
    : 0;

  const mergedWithTimes = mergedPRs.filter(p => p.merged_at);
  const avgMergeTimeHours = mergedWithTimes.length > 0
    ? mergedWithTimes.reduce((sum, p) => sum + dayjs(p.merged_at).diff(dayjs(p.created_at), 'hour', true), 0) / mergedWithTimes.length
    : 0;

  return {
    totalOpen: openPRs.length,
    totalClosed: closedPRs.length,
    totalMerged: mergedPRs.length,
    ...agingCounts,
    waitingForAuthor,
    waitingForReviewer,
    avgAgeHours: Math.round(avgAgeHours * 10) / 10,
    avgFirstReviewHours: Math.round(avgFirstReviewHours * 10) / 10,
    avgMergeTimeHours: Math.round(avgMergeTimeHours * 10) / 10,
    reviewBacklog: waitingForReviewer,
  };
}

function computePeopleAnalytics(prs, reviews) {
  const now = dayjs();
  
  // Reviewer analytics
  const reviewerMap = {};
  (reviews || []).forEach(r => {
    if (!r.reviewer_login) return;
    if (!reviewerMap[r.reviewer_login]) {
      reviewerMap[r.reviewer_login] = {
        login: r.reviewer_login,
        reviewsCompleted: 0,
        approvals: 0,
        changesRequested: 0,
        responseTimes: [],
        pendingReviews: 0,
        longestPendingHours: 0,
      };
    }
    const rm = reviewerMap[r.reviewer_login];
    rm.reviewsCompleted++;
    if (r.state === 'APPROVED') rm.approvals++;
    if (r.state === 'CHANGES_REQUESTED') rm.changesRequested++;
  });

  // Count pending reviews
  const openPRs = prs.filter(p => p.state === 'open');
  openPRs.forEach(p => {
    let requested = p.requested_reviewers || [];
    if (typeof requested === 'string') {
      try { requested = JSON.parse(requested); } catch { requested = []; }
    }
    requested.forEach(login => {
      if (!reviewerMap[login]) {
        reviewerMap[login] = {
          login,
          reviewsCompleted: 0,
          approvals: 0,
          changesRequested: 0,
          responseTimes: [],
          pendingReviews: 0,
          longestPendingHours: 0,
        };
      }
      reviewerMap[login].pendingReviews++;
      const pendingHours = now.diff(dayjs(p.created_at), 'hour', true);
      if (pendingHours > reviewerMap[login].longestPendingHours) {
        reviewerMap[login].longestPendingHours = pendingHours;
      }
    });
  });

  const reviewers = Object.values(reviewerMap)
    .map(r => ({
      ...r,
      avgResponseHours: r.responseTimes.length > 0
        ? Math.round((r.responseTimes.reduce((a, b) => a + b, 0) / r.responseTimes.length) * 10) / 10
        : null,
      longestPendingHours: Math.round(r.longestPendingHours * 10) / 10,
    }))
    .sort((a, b) => b.pendingReviews - a.pendingReviews);

  // Author analytics
  const authorMap = {};
  prs.forEach(p => {
    if (!p.author_login) return;
    if (!authorMap[p.author_login]) {
      authorMap[p.author_login] = {
        login: p.author_login,
        totalPRs: 0,
        openPRs: 0,
        ages: [],
        reviewCycles: [],
        responseTimes: [],
      };
    }
    const am = authorMap[p.author_login];
    am.totalPRs++;
    if (p.state === 'open') {
      am.openPRs++;
      am.ages.push(now.diff(dayjs(p.created_at), 'hour', true));
    }
    if (p.review_cycles_count) am.reviewCycles.push(p.review_cycles_count);
  });

  const authors = Object.values(authorMap)
    .map(a => ({
      login: a.login,
      totalPRs: a.totalPRs,
      openPRs: a.openPRs,
      avgPRAge: a.ages.length > 0
        ? Math.round((a.ages.reduce((s, v) => s + v, 0) / a.ages.length) * 10) / 10
        : 0,
      avgReviewCycles: a.reviewCycles.length > 0
        ? Math.round((a.reviewCycles.reduce((s, v) => s + v, 0) / a.reviewCycles.length) * 10) / 10
        : 0,
      avgResponseHours: a.responseTimes.length > 0
        ? Math.round((a.responseTimes.reduce((s, v) => s + v, 0) / a.responseTimes.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.openPRs - a.openPRs);

  return { reviewers, authors };
}

function computeBottlenecks(prs) {
  const now = dayjs();
  return prs
    .filter(p => p.state === 'open' && p.responsibility_state && !['MERGED', 'CLOSED', 'DRAFT'].includes(p.responsibility_state))
    .map(p => ({
      prNumber: p.number,
      prTitle: p.title,
      prUrl: p.url,
      responsibleLogin: p.responsible_login,
      state: p.responsibility_state,
      waitingHours: p.responsibility_started_at
        ? Math.round(now.diff(dayjs(p.responsibility_started_at), 'hour', true) * 10) / 10
        : 0,
      agingStatus: p.aging_status,
      reason: p.responsibility_reason,
    }))
    .sort((a, b) => b.waitingHours - a.waitingHours);
}

module.exports = { computeSummary, computePeopleAnalytics, computeBottlenecks };
