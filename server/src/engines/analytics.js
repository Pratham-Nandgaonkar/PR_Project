const dayjs = require('dayjs');
const { calculateBusinessHours, normalizeConfig } = require('./businessHours');

function computeSummary(prs) {
  const openPRs = prs.filter(p => p.state === 'open');
  const closedPRs = prs.filter(p => p.state === 'closed' && !p.is_merged);
  const mergedPRs = prs.filter(p => p.is_merged);

  const healthCounts = { on_track: 0, needs_attention: 0, at_risk: 0, critical: 0 };
  openPRs.forEach(p => {
    if (healthCounts[p.health_status] !== undefined) healthCounts[p.health_status]++;
  });

  let waitingForAuthor = 0, waitingForReviewer = 0;
  openPRs.forEach(p => {
    if (p.pending_on_summary && p.pending_on_summary.includes('Author')) {
      waitingForAuthor++;
    } else if (p.pending_on_summary) {
      waitingForReviewer++;
    }
  });

  const avgAgeHours = openPRs.length > 0
    ? openPRs.reduce((sum, p) => sum + (p.business_hours_age || 0), 0) / openPRs.length
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
    ...healthCounts,
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
      const pendingHours = p.business_hours_age || 0;
      if (pendingHours > reviewerMap[login].longestPendingHours) {
        reviewerMap[login].longestPendingHours = pendingHours;
      }
    });
  });

  const reviewers = Object.values(reviewerMap)
    .map(r => ({
      login: r.login,
      reviews_completed: r.reviewsCompleted,
      approvals: r.approvals,
      changes_requested: r.changesRequested,
      pending_reviews: r.pendingReviews,
      longest_pending_hours: Math.round(r.longestPendingHours * 10) / 10,
      avg_response_hours: r.responseTimes.length > 0
        ? Math.round((r.responseTimes.reduce((a, b) => a + b, 0) / r.responseTimes.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.pending_reviews - a.pending_reviews);

  // Author analytics
  const authorMap = {};
  prs.forEach(p => {
    if (!p.author_login) return;
    if (!authorMap[p.author_login]) {
      authorMap[p.author_login] = {
        login: p.author_login,
        total_prs: 0,
        open_prs: 0,
        ages: [],
        reviewCycles: [],
        responseTimes: [],
      };
    }
    const am = authorMap[p.author_login];
    am.total_prs++;
    if (p.state === 'open') {
      am.open_prs++;
      am.ages.push(p.business_hours_age || 0);
    }
    if (p.review_cycles_count) am.reviewCycles.push(p.review_cycles_count);
  });

  const authors = Object.values(authorMap)
    .map(a => ({
      login: a.login,
      total_prs: a.total_prs,
      open_prs: a.open_prs,
      avg_pr_age_hours: a.ages.length > 0
        ? Math.round((a.ages.reduce((s, v) => s + v, 0) / a.ages.length) * 10) / 10
        : 0,
      avg_review_cycles: a.reviewCycles.length > 0
        ? Math.round((a.reviewCycles.reduce((s, v) => s + v, 0) / a.reviewCycles.length) * 10) / 10
        : 0,
      avg_response_hours: a.responseTimes.length > 0
        ? Math.round((a.responseTimes.reduce((s, v) => s + v, 0) / a.responseTimes.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.open_prs - a.open_prs);

  return { reviewers, authors };
}

function computeBottlenecks(prs, actionItems = []) {
  const bottlenecks = [];
  for (const item of actionItems) {
    const pr = prs.find(p => p.id === item.pull_request_id);
    if (pr) {
      bottlenecks.push({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        assignee_login: item.assignee_login,
        action_type: item.action_type,
        waiting_hours: Math.round((item.waiting_biz_hours || 0) * 10) / 10,
        health_status: pr.health_status,
        description: item.description,
      });
    }
  }
  return bottlenecks.sort((a, b) => b.waiting_hours - a.waiting_hours);
}

function generateHistoricalSnapshots(prs, firstReviews = [], repositoryId, maxDays = 30, businessHoursConfig = null) {
  if (!prs || prs.length === 0) return [];

  const bizConfig = normalizeConfig(businessHoursConfig);

  // Find earliest PR creation date
  const minCreated = prs.reduce((min, p) => {
    const d = dayjs(p.created_at);
    return d.isBefore(min) ? d : min;
  }, dayjs());

  const daysSinceMin = Math.max(1, dayjs().diff(minCreated, 'day'));
  const daysToGenerate = Math.min(maxDays, Math.max(7, daysSinceMin));

  // Pre-process earliest first review per PR
  const firstReviewByPR = {};
  (firstReviews || []).forEach(r => {
    if (!r.first_reviewed_at) return;
    const prId = r.pull_request_id;
    if (!firstReviewByPR[prId] || dayjs(r.first_reviewed_at).isBefore(dayjs(firstReviewByPR[prId].first_reviewed_at))) {
      firstReviewByPR[prId] = {
        created_at: r.created_at,
        first_reviewed_at: r.first_reviewed_at,
      };
    }
  });

  const snapshots = [];
  for (let i = daysToGenerate; i >= 1; i--) {
    const targetDate = dayjs().subtract(i, 'day').endOf('day');

    const openOnDay = prs.filter(pr => {
      const created = dayjs(pr.created_at);
      const closed = pr.closed_at ? dayjs(pr.closed_at) : null;
      return created.isBefore(targetDate) && (!closed || closed.isAfter(targetDate));
    });

    let healthy = 0, attention = 0, aging = 0, critical = 0;
    let totalAgeHours = 0;
    let waitingAuthor = 0, waitingReviewer = 0;

    openOnDay.forEach(pr => {
      const ageHours = calculateBusinessHours(pr.created_at, targetDate.toDate(), bizConfig);
      totalAgeHours += ageHours;

      if (pr.is_draft) {
        healthy++;
      } else if (ageHours > 160) {
        critical++;
      } else if (ageHours > 72) {
        aging++;
      } else if (ageHours > 24) {
        attention++;
      } else {
        healthy++;
      }

      if (pr.pending_on_summary && pr.pending_on_summary.includes('Author')) {
        waitingAuthor++;
      } else {
        waitingReviewer++;
      }
    });

    const avgAgeHours = openOnDay.length > 0
      ? Math.round((totalAgeHours / openOnDay.length) * 10) / 10
      : 0;

    const historicalReviews = Object.values(firstReviewByPR)
      .filter(r => dayjs(r.first_reviewed_at).isBefore(targetDate))
      .map(r => {
        const created = new Date(r.created_at).getTime();
        const reviewed = new Date(r.first_reviewed_at).getTime();
        return (reviewed - created) / (1000 * 60 * 60);
      })
      .filter(h => h >= 0 && h < 8760);

    const avgFirstReviewHours = historicalReviews.length > 0
      ? Math.round(historicalReviews.reduce((a, b) => a + b, 0) / historicalReviews.length * 10) / 10
      : null;

    snapshots.push({
      repository_id: repositoryId,
      snapshot_at: targetDate.toDate(),
      total_open_prs: openOnDay.length,
      healthy_count: healthy,
      attention_count: attention,
      aging_count: aging,
      critical_count: critical,
      waiting_for_author_count: waitingAuthor,
      waiting_for_reviewer_count: waitingReviewer,
      avg_pr_age_hours: avgAgeHours,
      avg_first_review_hours: avgFirstReviewHours,
      details: JSON.stringify({}),
    });
  }

  return snapshots;
}

module.exports = { computeSummary, computePeopleAnalytics, computeBottlenecks, generateHistoricalSnapshots };
