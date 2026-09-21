const dayjs = require('dayjs');
const db = require('../db');
const config = require('../config');
const github = require('./github');
const { classifyComment } = require('../engines/comments');
const { determineActionItems } = require('../engines/actionItems');
const { classifyHealth } = require('../engines/health');
const { calculateBusinessHours, normalizeConfig, defaultConfig } = require('../engines/businessHours');
const { detectReviewCycles } = require('../engines/reviewCycles');

async function synchronizeRepository(repositoryId) {
  const repo = await db('repositories').where({ id: repositoryId }).first();
  if (!repo) {
    throw new Error(`Repository ${repositoryId} not found`);
  }

  github.resetApiCallCount();

  const [syncLog] = await db('sync_logs').insert({
    repository_id: repositoryId,
    started_at: new Date(),
    status: 'running',
  }).returning('*');

  try {
    console.log(`[Sync] Starting V2 sync for ${repo.full_name}...`);

    let filters = repo.sync_filters || [];
    if (typeof filters === 'string') {
      try { filters = JSON.parse(filters); } catch (e) { filters = []; }
    }
    const bizConfig = normalizeConfig(repo.business_hours_config);

    const ghPRs = await github.fetchPullRequests(repo.owner, repo.name, 'all', config.github.prFetchLimit, filters);
    console.log(`[Sync] Fetched ${ghPRs.length} PRs (open/closed) using filters`);

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

        // Fetch full PR detail for file/commit stats (not included in list endpoint)
        let ghDetail = null;
        try {
          ghDetail = await github.fetchPRDetail(repo.owner, repo.name, ghPR.number);
        } catch (e) {
          console.warn(`[Sync] Could not fetch detail for PR #${ghPR.number}:`, e.message);
        }
        if (ghDetail) {
          prData.commits_count = ghDetail.commits || 0;
          prData.changed_files_count = ghDetail.changed_files || 0;
          prData.additions = ghDetail.additions || 0;
          prData.deletions = ghDetail.deletions || 0;
          prData.head_ref = ghDetail.head?.ref || prData.head_ref;
          prData.base_ref = ghDetail.base?.ref || prData.base_ref;
          prData.merged_by = ghDetail.merged_by?.login || prData.merged_by;
        }

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
        const ageEnd = prRecord.state === 'closed' ? (prRecord.closed_at || prRecord.merged_at || new Date()) : new Date();
        prRecord.business_hours_age = calculateBusinessHours(prRecord.created_at, ageEnd, bizConfig);
        
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

        // Compute last_activity_at = most recent of: updated_at, latest review, latest event, latest commit
        const activityTimestamps = [
          prRecord.updated_at ? new Date(prRecord.updated_at) : null,
          ...ghReviews.map(r => r.submitted_at ? new Date(r.submitted_at) : null),
          ...ghEvents.map(e => e.created_at ? new Date(e.created_at) : null),
          ...ghCommits.map(c => {
            const d = c.commit?.author?.date || c.commit?.committer?.date;
            return d ? new Date(d) : null;
          }),
        ].filter(Boolean);
        const lastActivityAt = activityTimestamps.length > 0
          ? new Date(Math.max(...activityTimestamps.map(d => d.getTime())))
          : prRecord.updated_at;

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
          last_activity_at: lastActivityAt,
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
        if (prsUpdated % 10 === 0 || prsUpdated === ghPRs.length) {
          console.log(`[Sync] Progress: ${prsUpdated}/${ghPRs.length} PRs analyzed...`);
        }
      } catch (prErr) {
        console.error(`[Sync] Error processing PR #${ghPR.number}:`, prErr.message);
      }
    }

    const allOpenPRs = await db('pull_requests').where({ repository_id: repositoryId, state: 'open' });

    // Compute avg first review time from pr_reviewers for all PRs in this repo that have been reviewed
    const firstReviews = await db('pr_reviewers')
      .join('pull_requests', 'pr_reviewers.pull_request_id', 'pull_requests.id')
      .where('pull_requests.repository_id', repositoryId)
      .whereNotNull('pr_reviewers.first_reviewed_at')
      .select('pull_requests.created_at', 'pr_reviewers.first_reviewed_at', 'pr_reviewers.pull_request_id')
      .orderBy('pr_reviewers.first_reviewed_at', 'asc');

    // For each PR, take only the earliest first_reviewed_at across all reviewers
    const firstReviewByPR = {};
    firstReviews.forEach(r => {
      const prId = r.pull_request_id;
      if (!firstReviewByPR[prId]) {
        firstReviewByPR[prId] = { created_at: r.created_at, first_reviewed_at: r.first_reviewed_at };
      }
    });

    const firstReviewTimes = Object.values(firstReviewByPR)
      .map(r => {
        const created = new Date(r.created_at).getTime();
        const reviewed = new Date(r.first_reviewed_at).getTime();
        return (reviewed - created) / (1000 * 60 * 60); // hours
      })
      .filter(h => h >= 0 && h < 8760); // sanity check: 0–365 days

    const avgFirstReviewHours = firstReviewTimes.length > 0
      ? Math.round(firstReviewTimes.reduce((a, b) => a + b, 0) / firstReviewTimes.length * 10) / 10
      : null;

    const snapshotData = {
      repository_id: repositoryId,
      snapshot_at: new Date(),
      total_open_prs: allOpenPRs.length,
      healthy_count: allOpenPRs.filter(p => p.health_status === 'on_track').length,
      attention_count: allOpenPRs.filter(p => p.health_status === 'needs_attention').length,
      aging_count: allOpenPRs.filter(p => p.health_status === 'at_risk').length,
      critical_count: allOpenPRs.filter(p => p.health_status === 'critical').length,
      waiting_for_author_count: allOpenPRs.filter(p => p.pending_on_summary && p.pending_on_summary.includes('Author')).length,
      waiting_for_reviewer_count: allOpenPRs.filter(p => !p.pending_on_summary || !p.pending_on_summary.includes('Author')).length,
      avg_pr_age_hours: allOpenPRs.length > 0
        ? Math.round(allOpenPRs.reduce((s, p) => s + (p.business_hours_age || 0), 0) / allOpenPRs.length * 10) / 10
        : 0,
      avg_first_review_hours: avgFirstReviewHours,
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

async function recalculateRepository(repositoryId) {
  const repo = await db('repositories').where({ id: repositoryId }).first();
  if (!repo) return;

  const bizConfig = normalizeConfig(repo.business_hours_config);
  const prs = await db('pull_requests').where({ repository_id: repositoryId });
  if (prs.length === 0) return;

  const prIds = prs.map(p => p.id);
  const prReviewersRows = await db('pr_reviewers').whereIn('pull_request_id', prIds);
  const prCommentsRows = await db('pr_comment_threads').whereIn('pull_request_id', prIds);
  const checkRows = await db('pr_checks').whereIn('pull_request_id', prIds);
  const cyclesRows = await db('review_cycles').whereIn('pull_request_id', prIds);

  for (const pr of prs) {
    const ageEnd = pr.state === 'closed' ? (pr.closed_at || pr.merged_at || new Date()) : new Date();
    const bizHoursAge = calculateBusinessHours(pr.created_at, ageEnd, bizConfig);
    pr.business_hours_age = bizHoursAge;

    if (pr.state === 'closed') {
      await db('pull_requests').where({ id: pr.id }).update({
        business_hours_age: bizHoursAge,
        last_analyzed_at: new Date(),
      });
      continue;
    }

    const thisReviewers = prReviewersRows.filter(r => r.pull_request_id === pr.id);
    const thisComments = prCommentsRows.filter(c => c.pull_request_id === pr.id);
    const thisChecks = checkRows.filter(c => c.pull_request_id === pr.id);
    const thisCycles = cyclesRows.filter(c => c.pull_request_id === pr.id);

    const { actionItems, pendingOnSummary } = determineActionItems(
      pr, thisReviewers, thisComments, thisChecks, bizConfig
    );

    const healthStatus = classifyHealth(pr, actionItems, thisCycles.length, bizConfig);
    const businessHoursWaiting = actionItems.length > 0
      ? Math.max(...actionItems.map(a => a.waiting_biz_hours || 0))
      : 0;

    await db('pull_requests').where({ id: pr.id }).update({
      business_hours_age: bizHoursAge,
      business_hours_waiting: businessHoursWaiting,
      health_status: healthStatus,
      pending_on_summary: pendingOnSummary,
      last_analyzed_at: new Date(),
    });

    await db('pr_action_items').where({ pull_request_id: pr.id }).del();
    if (actionItems.length > 0) {
      await db('pr_action_items').insert(actionItems.map(a => ({
        pull_request_id: pr.id,
        ...a
      })));
    }
  }

  // Recalculate historical snapshots for this repo so Trends charts reflect new business hours config
  const snapshots = await db('pr_snapshots').where({ repository_id: repositoryId });
  for (const snap of snapshots) {
    const snapDate = new Date(snap.snapshot_at);
    const openAtSnap = prs.filter(p => {
      const created = new Date(p.created_at);
      const closed = p.closed_at ? new Date(p.closed_at) : null;
      return created <= snapDate && (!closed || closed > snapDate);
    });

    if (openAtSnap.length > 0) {
      const ages = openAtSnap.map(p => calculateBusinessHours(p.created_at, snapDate, bizConfig));
      const avgAge = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length * 10) / 10;
      
      const healthy = ages.filter(a => a <= 24).length;
      const attention = ages.filter(a => a > 24 && a <= 72).length;
      const aging = ages.filter(a => a > 72 && a <= 160).length;
      const critical = ages.filter(a => a > 160).length;

      await db('pr_snapshots').where({ id: snap.id }).update({
        avg_pr_age_hours: avgAge,
        healthy_count: healthy,
        attention_count: attention,
        aging_count: aging,
        critical_count: critical,
      });
    }
  }

  // Take a new snapshot as of now with updated numbers
  const allOpenPRs = await db('pull_requests').where({ repository_id: repositoryId, state: 'open' });
  const firstReviews = await db('pr_reviewers')
    .join('pull_requests', 'pr_reviewers.pull_request_id', 'pull_requests.id')
    .where('pull_requests.repository_id', repositoryId)
    .whereNotNull('pr_reviewers.first_reviewed_at')
    .select('pull_requests.created_at', 'pr_reviewers.first_reviewed_at', 'pr_reviewers.pull_request_id')
    .orderBy('pr_reviewers.first_reviewed_at', 'asc');

  const firstReviewByPR = {};
  firstReviews.forEach(r => {
    if (!firstReviewByPR[r.pull_request_id]) {
      firstReviewByPR[r.pull_request_id] = { created_at: r.created_at, first_reviewed_at: r.first_reviewed_at };
    }
  });

  const firstReviewTimes = Object.values(firstReviewByPR)
    .map(r => {
      const created = new Date(r.created_at).getTime();
      const reviewed = new Date(r.first_reviewed_at).getTime();
      return (reviewed - created) / (1000 * 60 * 60);
    })
    .filter(h => h >= 0 && h < 8760);

  const avgFirstReviewHours = firstReviewTimes.length > 0
    ? Math.round(firstReviewTimes.reduce((a, b) => a + b, 0) / firstReviewTimes.length * 10) / 10
    : null;

  const snapshotData = {
    repository_id: repositoryId,
    snapshot_at: new Date(),
    total_open_prs: allOpenPRs.length,
    healthy_count: allOpenPRs.filter(p => p.health_status === 'on_track').length,
    attention_count: allOpenPRs.filter(p => p.health_status === 'needs_attention').length,
    aging_count: allOpenPRs.filter(p => p.health_status === 'at_risk').length,
    critical_count: allOpenPRs.filter(p => p.health_status === 'critical').length,
    waiting_for_author_count: allOpenPRs.filter(p => p.pending_on_summary && p.pending_on_summary.includes('Author')).length,
    waiting_for_reviewer_count: allOpenPRs.filter(p => !p.pending_on_summary || !p.pending_on_summary.includes('Author')).length,
    avg_pr_age_hours: allOpenPRs.length > 0
      ? Math.round(allOpenPRs.reduce((s, p) => s + (p.business_hours_age || 0), 0) / allOpenPRs.length * 10) / 10
      : 0,
    avg_first_review_hours: avgFirstReviewHours,
  };

  await db('pr_snapshots').insert(snapshotData);
}

module.exports = { synchronizeRepository, recalculateRepository };
