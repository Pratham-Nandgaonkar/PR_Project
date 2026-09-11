const dayjs = require('dayjs');

function detectReviewCycles(pr, reviews, events) {
  const meaningfulStates = ['APPROVED', 'CHANGES_REQUESTED'];
  const meaningfulReviews = (reviews || [])
    .filter(r => meaningfulStates.includes(r.state))
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  if (meaningfulReviews.length === 0) return [];

  const commitEvents = (events || [])
    .filter(e => e.event_type === 'committed' || e.event_type === 'head_ref_force_pushed')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const cycles = [];
  let cycleStart = pr.created_at;

  for (let i = 0; i < meaningfulReviews.length; i++) {
    const review = meaningfulReviews[i];
    const nextReview = meaningfulReviews[i + 1];
    const cycleEnd = review.submitted_at;

    // Count commits in this cycle
    const commitsInCycle = commitEvents.filter(
      e => dayjs(e.created_at).isAfter(dayjs(cycleStart)) &&
           dayjs(e.created_at).isBefore(dayjs(cycleEnd).add(1, 'minute'))
    ).length;

    // Reviewer response time: from cycle start to review
    const reviewerResponseHours = dayjs(cycleEnd).diff(dayjs(cycleStart), 'hour', true);

    // Author response time: from review to next commit (if changes requested)
    let authorRespondedAt = null;
    let authorResponseHours = null;

    if (review.state === 'CHANGES_REQUESTED') {
      const nextCommit = commitEvents.find(
        e => dayjs(e.created_at).isAfter(dayjs(cycleEnd))
      );
      if (nextCommit) {
        authorRespondedAt = nextCommit.created_at;
        authorResponseHours = dayjs(nextCommit.created_at).diff(dayjs(cycleEnd), 'hour', true);
      }
    }

    cycles.push({
      cycleNumber: i + 1,
      startedAt: cycleStart,
      endedAt: cycleEnd,
      reviewSubmittedAt: cycleEnd,
      reviewerLogin: review.reviewer_login,
      reviewState: review.state,
      reviewerResponseHours: Math.round(reviewerResponseHours * 100) / 100,
      authorRespondedAt,
      authorResponseHours: authorResponseHours !== null ? Math.round(authorResponseHours * 100) / 100 : null,
      commitsInCycle,
    });

    // Next cycle starts from author response or review time
    cycleStart = authorRespondedAt || cycleEnd;
  }

  return cycles;
}

module.exports = { detectReviewCycles };
