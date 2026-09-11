const dayjs = require('dayjs');
const db = require('../db');
const config = require('../config');
const github = require('./github');
const { determineResponsibility, checkStaleness } = require('../engines/responsibility');
const { classifyAging } = require('../engines/aging');
const { detectReviewCycles } = require('../engines/reviewCycles');

async function synchronizeRepository(repositoryId) {
  const repo = await db('repositories').where({ id: repositoryId }).first();
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  github.resetApiCallCount();

  // Create sync log
  const [syncLog] = await db('sync_logs').insert({
    repository_id: repositoryId,
    started_at: new Date(),
    status: 'running',
  }).returning('*');

  try {
    console.log(`[Sync] Starting sync for ${repo.full_name}...`);

    // Fetch open PRs
    const ghPRs = await github.fetchPullRequests(repo.owner, repo.name, 'open', config.github.prFetchLimit);
    console.log(`[Sync] Fetched ${ghPRs.length} open PRs`);

    let prsUpdated = 0;

    for (const ghPR of ghPRs) {
      try {
        // Upsert PR
        const prData = {
          repository_id: repositoryId,
          github_pr_id: ghPR.id,
          number: ghPR.number,
          title: ghPR.title,
          url: ghPR.html_url,
          api_url: ghPR.url,
          author_login: ghPR.user?.login || 'unknown',
          author_avatar_url: ghPR.user?.avatar_url || null,
          state: ghPR.state,
          is_draft: ghPR.draft || false,
          is_merged: !!ghPR.merged_at,
          created_at: ghPR.created_at,
          updated_at: ghPR.updated_at,
          closed_at: ghPR.closed_at || null,
          merged_at: ghPR.merged_at || null,
          merged_by: ghPR.merged_by?.login || null,
          head_ref: ghPR.head?.ref || null,
          base_ref: ghPR.base?.ref || null,
          commits_count: ghPR.commits || 0,
          changed_files_count: ghPR.changed_files || 0,
          additions: ghPR.additions || 0,
          deletions: ghPR.deletions || 0,
          labels: JSON.stringify((ghPR.labels || []).map(l => ({ name: l.name, color: l.color }))),
          assignees: JSON.stringify((ghPR.assignees || []).map(a => a.login)),
          requested_reviewers: JSON.stringify((ghPR.requested_reviewers || []).map(r => r.login)),
          requested_teams: JSON.stringify((ghPR.requested_teams || []).map(t => t.slug)),
          comments_count: ghPR.comments || 0,
          review_comments_count: ghPR.review_comments || 0,
        };

        // Upsert
        let [prRecord] = await db('pull_requests')
          .where({ repository_id: repositoryId, number: ghPR.number })
          .update(prData)
          .returning('*');

        if (!prRecord) {
          [prRecord] = await db('pull_requests').insert(prData).returning('*');
        }

        // Fetch reviews
        const ghReviews = await github.fetchReviews(repo.owner, repo.name, ghPR.number);
        await db('reviews').where({ pull_request_id: prRecord.id }).del();
        if (ghReviews.length > 0) {
          await db('reviews').insert(
            ghReviews.map(r => ({
              pull_request_id: prRecord.id,
              github_review_id: r.id,
              reviewer_login: r.user?.login || 'unknown',
              state: r.state,
              body: r.body || null,
              submitted_at: r.submitted_at,
            }))
          );
        }

        // Fetch events
        const ghEvents = await github.fetchPREvents(repo.owner, repo.name, ghPR.number);
        await db('pr_events').where({ pull_request_id: prRecord.id }).del();
        const eventRows = ghEvents.map(e => ({
          pull_request_id: prRecord.id,
          github_event_id: e.id,
          event_type: e.event,
          actor_login: e.actor?.login || null,
          created_at: e.created_at,
          data: JSON.stringify(e),
        }));

        // Fetch commits and add as events
        const ghCommits = await github.fetchPRCommits(repo.owner, repo.name, ghPR.number);
        ghCommits.forEach(c => {
          eventRows.push({
            pull_request_id: prRecord.id,
            github_event_id: null,
            event_type: 'committed',
            actor_login: c.author?.login || c.commit?.author?.name || null,
            created_at: c.commit?.author?.date || c.commit?.committer?.date,
            data: JSON.stringify({ sha: c.sha, message: c.commit?.message }),
          });
        });

        if (eventRows.length > 0) {
          await db('pr_events').insert(eventRows);
        }

        // Run analysis engines
        const reviews = await db('reviews').where({ pull_request_id: prRecord.id }).orderBy('submitted_at', 'asc');
        const events = await db('pr_events').where({ pull_request_id: prRecord.id }).orderBy('created_at', 'asc');

        let responsibility = determineResponsibility(prRecord, reviews, events);
        responsibility = checkStaleness(responsibility, prRecord, events);
        const aging = classifyAging(prRecord, responsibility);
        const cycles = detectReviewCycles(prRecord, reviews, events);

        // Compute derived fields
        const allDates = [
          prRecord.updated_at,
          ...reviews.map(r => r.submitted_at),
          ...events.map(e => e.created_at),
        ].filter(Boolean);
        const lastActivityAt = allDates.length > 0
          ? allDates.reduce((max, d) => new Date(d) > new Date(max) ? d : max)
          : prRecord.updated_at;

        const firstReview = reviews.find(r => r.state !== 'PENDING');
        const firstApproval = reviews.find(r => r.state === 'APPROVED');

        // Update PR with computed fields
        await db('pull_requests').where({ id: prRecord.id }).update({
          aging_status: aging.status,
          responsibility_state: responsibility.state,
          responsible_login: responsibility.responsibleLogin,
          responsibility_reason: responsibility.reason,
          responsibility_started_at: responsibility.startedAt,
          review_cycles_count: cycles.length,
          avg_review_cycle_hours: cycles.length > 0
            ? Math.round((cycles.reduce((s, c) => s + c.reviewerResponseHours, 0) / cycles.length) * 10) / 10
            : null,
          first_review_at: firstReview?.submitted_at || null,
          first_approval_at: firstApproval?.submitted_at || null,
          last_activity_at: lastActivityAt,
          last_analyzed_at: new Date(),
        });

        // Update review cycles
        await db('review_cycles').where({ pull_request_id: prRecord.id }).del();
        if (cycles.length > 0) {
          await db('review_cycles').insert(
            cycles.map(c => ({
              pull_request_id: prRecord.id,
              cycle_number: c.cycleNumber,
              started_at: c.startedAt,
              ended_at: c.endedAt,
              review_submitted_at: c.reviewSubmittedAt,
              reviewer_login: c.reviewerLogin,
              review_state: c.reviewState,
              author_responded_at: c.authorRespondedAt,
              reviewer_response_hours: c.reviewerResponseHours,
              author_response_hours: c.authorResponseHours,
              commits_in_cycle: c.commitsInCycle,
            }))
          );
        }

        prsUpdated++;
      } catch (prErr) {
        console.error(`[Sync] Error processing PR #${ghPR.number}:`, prErr.message);
      }
    }

    // Create snapshot
    const allOpenPRs = await db('pull_requests').where({ repository_id: repositoryId, state: 'open' });
    const now = dayjs();
    const snapshotData = {
      repository_id: repositoryId,
      snapshot_at: new Date(),
      total_open_prs: allOpenPRs.length,
      healthy_count: allOpenPRs.filter(p => p.aging_status === 'healthy').length,
      attention_count: allOpenPRs.filter(p => p.aging_status === 'attention').length,
      aging_count: allOpenPRs.filter(p => p.aging_status === 'aging').length,
      critical_count: allOpenPRs.filter(p => p.aging_status === 'critical').length,
      waiting_for_author_count: allOpenPRs.filter(p => ['CHANGES_REQUESTED', 'DRAFT', 'NO_REVIEWER'].includes(p.responsibility_state)).length,
      waiting_for_reviewer_count: allOpenPRs.filter(p => p.responsibility_state === 'WAITING_FOR_REVIEW').length,
      avg_pr_age_hours: allOpenPRs.length > 0
        ? Math.round(allOpenPRs.reduce((s, p) => s + now.diff(dayjs(p.created_at), 'hour', true), 0) / allOpenPRs.length * 10) / 10
        : 0,
    };
    await db('pr_snapshots').insert(snapshotData);

    // Update repo
    await db('repositories').where({ id: repositoryId }).update({ last_synced_at: new Date() });

    // Get rate limit
    let rateLimitRemaining = null;
    try {
      const rl = await github.getRateLimit();
      rateLimitRemaining = rl.remaining;
    } catch (e) { /* ignore */ }

    // Update sync log
    await db('sync_logs').where({ id: syncLog.id }).update({
      completed_at: new Date(),
      status: 'completed',
      prs_fetched: ghPRs.length,
      prs_updated: prsUpdated,
      api_calls_made: github.getApiCallCount(),
      rate_limit_remaining: rateLimitRemaining,
    });

    console.log(`[Sync] Completed: ${prsUpdated}/${ghPRs.length} PRs processed`);
    return { success: true, prsFetched: ghPRs.length, prsUpdated };

  } catch (error) {
    console.error(`[Sync] Failed:`, error.message);
    await db('sync_logs').where({ id: syncLog.id }).update({
      completed_at: new Date(),
      status: 'failed',
      error_message: error.message,
      api_calls_made: github.getApiCallCount(),
    });
    return { success: false, error: error.message };
  }
}

module.exports = { synchronizeRepository };
