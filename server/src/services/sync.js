const dayjs = require('dayjs');
const db = require('../db');
const config = require('../config');
const github = require('./github');
const { classifyComment } = require('../engines/comments');
const { determineActionItems } = require('../engines/actionItems');
const { classifyHealth } = require('../engines/health');
const { calculateBusinessHours, defaultConfig } = require('../engines/businessHours');
const { detectReviewCycles } = require('../engines/reviewCycles');

async function synchronizeRepository(repositoryId) {
  const repo = await db('repositories').where({ id: repositoryId }).first();
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  github.resetApiCallCount();

  const [syncLog] = await db('sync_logs').insert({
    repository_id: repositoryId,
    started_at: new Date(),
    status: 'running',
  }).returning('*');

  try {
    console.log(`[Sync] Starting V2 sync for ${repo.full_name}...`);

    const filters = repo.sync_filters || [];
    const bizConfig = repo.business_hours_config || defaultConfig;

    const ghPRs = await github.fetchPullRequests(repo.owner, repo.name, 'open', config.github.prFetchLimit, filters);
    console.log(`[Sync] Fetched ${ghPRs.length} open PRs using filters`);

    let prsUpdated = 0;

    for (const ghPR of ghPRs) {
      try {
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

        let [prRecord] = await db('pull_requests')
          .where({ repository_id: repositoryId, number: ghPR.number })
          .update(prData)
          .returning('*');

        if (!prRecord) {
          [prRecord] = await db('pull_requests').insert(prData).returning('*');
        }

        // Fetch API details
        const ghReviews = await github.fetchReviews(repo.owner, repo.name, ghPR.number);
        const ghEvents = await github.fetchPREvents(repo.owner, repo.name, ghPR.number);
        const ghCommits = await github.fetchPRCommits(repo.owner, repo.name, ghPR.number);
        const ghComments = await github.fetchPRComments(repo.owner, repo.name, ghPR.number);
        
        // Use the latest commit SHA to fetch checks, as head_ref fails for cross-fork PRs
        const latestCommitSha = ghCommits.length > 0 ? ghCommits[ghCommits.length - 1].sha : null;
        const ghChecks = latestCommitSha ? await github.fetchCheckRuns(repo.owner, repo.name, latestCommitSha) : [];

        // Save Reviews
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

        // Save Events
        await db('pr_events').where({ pull_request_id: prRecord.id }).del();
        const eventRows = ghEvents.map(e => ({
          pull_request_id: prRecord.id,
          github_event_id: e.id,
          event_type: e.event,
          actor_login: e.actor?.login || null,
          created_at: e.created_at,
          data: JSON.stringify(e),
        }));
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

        // Populate pr_reviewers
        const requestedReviewers = (ghPR.requested_reviewers || []).map(r => r.login);
        const actualReviewers = new Set([...requestedReviewers, ...ghReviews.map(r => r.user?.login).filter(Boolean)]);
        
        const commitTimes = ghCommits.map(c => new Date(c.commit?.author?.date || c.commit?.committer?.date));
        const latestCommitTime = commitTimes.length > 0 ? new Date(Math.max(...commitTimes)) : new Date(0);

        ghReviews.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
        
        await db('pr_reviewers').where({ pull_request_id: prRecord.id }).del();
        const prReviewersRows = [];
        let assignOrder = 1;

        for (const login of actualReviewers) {
          const userReviews = ghReviews.filter(r => r.user?.login === login);
          const firstReview = userReviews.length > 0 ? userReviews[0] : null;
          const latestReview = userReviews.length > 0 ? userReviews[userReviews.length - 1] : null;
          
          let state = 'PENDING';
          if (latestReview) state = latestReview.state;

          const latest_reviewed_at = latestReview ? new Date(latestReview.submitted_at) : null;
          const re_review_needed = latest_reviewed_at && latestCommitTime > latest_reviewed_at;

          prReviewersRows.push({
            pull_request_id: prRecord.id,
            reviewer_login: login,
            review_state: state,
            assignment_order: assignOrder++,
            first_reviewed_at: firstReview ? new Date(firstReview.submitted_at) : null,
            latest_reviewed_at: latest_reviewed_at,
            re_review_needed,
          });
        }
        if (prReviewersRows.length > 0) {
          await db('pr_reviewers').insert(prReviewersRows);
        }

        // Populate pr_comment_threads
        await db('pr_comment_threads').where({ pull_request_id: prRecord.id }).del();
        const prCommentsRows = [];
        for (const comment of ghComments) {
          prCommentsRows.push({
            pull_request_id: prRecord.id,
            github_comment_id: comment.id,
            author_login: comment.user?.login || 'unknown',
            body: comment.body,
            classification: classifyComment(comment.body),
            is_resolved: false,
            created_at: comment.created_at,
          });
        }
        if (prCommentsRows.length > 0) {
          await db('pr_comment_threads').insert(prCommentsRows);
        }

        // Populate pr_checks
        await db('pr_checks').where({ pull_request_id: prRecord.id }).del();
        const checkRows = (ghChecks.check_runs || ghChecks).map(c => ({
          pull_request_id: prRecord.id,
          check_name: c.name,
          status: c.status,
          conclusion: c.conclusion,
          started_at: c.started_at,
          completed_at: c.completed_at,
        }));
        if (checkRows.length > 0) {
          await db('pr_checks').insert(checkRows);
        }

        // Call engines
        prRecord.business_hours_age = calculateBusinessHours(prRecord.created_at, new Date(), bizConfig);
        
        const { actionItems, pendingOnSummary } = determineActionItems(
          prRecord, prReviewersRows, prCommentsRows, checkRows, bizConfig
        );

        const reviewsDb = await db('reviews').where({ pull_request_id: prRecord.id }).orderBy('submitted_at', 'asc');
        const eventsDb = await db('pr_events').where({ pull_request_id: prRecord.id }).orderBy('created_at', 'asc');
        const cycles = detectReviewCycles(prRecord, reviewsDb, eventsDb);
        
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

        const healthStatus = classifyHealth(prRecord, actionItems, cycles.length, bizConfig);
        const unresolvedCommentsCount = prCommentsRows.filter(c => !c.is_resolved).length;
        const totalReviewersCount = actualReviewers.size;
        const approvedReviewersCount = prReviewersRows.filter(r => r.review_state === 'APPROVED' && !r.re_review_needed).length;
        const pendingReviewersCount = prReviewersRows.filter(r => r.review_state === 'PENDING' || r.re_review_needed).length;
        const businessHoursWaiting = actionItems.length > 0 ? Math.max(...actionItems.map(a => a.waiting_biz_hours || 0)) : 0;

        await db('pull_requests').where({ id: prRecord.id }).update({
          health_status: healthStatus,
          pending_on_summary: pendingOnSummary,
          unresolved_comments_count: unresolvedCommentsCount,
          total_reviewers_count: totalReviewersCount,
          approved_reviewers_count: approvedReviewersCount,
          pending_reviewers_count: pendingReviewersCount,
          business_hours_waiting: businessHoursWaiting,
          business_hours_age: prRecord.business_hours_age,
          review_cycles_count: cycles.length,
          last_analyzed_at: new Date(),
        });

        await db('pr_action_items').where({ pull_request_id: prRecord.id }).del();
        if (actionItems.length > 0) {
          await db('pr_action_items').insert(actionItems.map(a => ({
            pull_request_id: prRecord.id,
            ...a
          })));
        }

        prsUpdated++;
      } catch (prErr) {
        console.error(`[Sync] Error processing PR #${ghPR.number}:`, prErr.message);
      }
    }

    const allOpenPRs = await db('pull_requests').where({ repository_id: repositoryId, state: 'open' });
    const snapshotData = {
      repository_id: repositoryId,
      snapshot_at: new Date(),
      total_open_prs: allOpenPRs.length,
      healthy_count: allOpenPRs.filter(p => p.health_status === 'on_track').length,
      attention_count: allOpenPRs.filter(p => p.health_status === 'needs_attention').length,
      aging_count: allOpenPRs.filter(p => p.health_status === 'at_risk').length,
      critical_count: allOpenPRs.filter(p => p.health_status === 'critical').length,
      waiting_for_author_count: allOpenPRs.filter(p => p.pending_on_summary.includes('Author')).length,
      waiting_for_reviewer_count: allOpenPRs.filter(p => !p.pending_on_summary.includes('Author')).length,
      avg_pr_age_hours: allOpenPRs.length > 0
        ? Math.round(allOpenPRs.reduce((s, p) => s + (p.business_hours_age || 0), 0) / allOpenPRs.length * 10) / 10
        : 0,
    };
    await db('pr_snapshots').insert(snapshotData);

    await db('repositories').where({ id: repositoryId }).update({ last_synced_at: new Date() });

    let rateLimitRemaining = null;
    try {
      const rl = await github.getRateLimit();
      rateLimitRemaining = rl.remaining;
    } catch (e) { /* ignore */ }

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
