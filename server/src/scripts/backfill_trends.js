const dayjs = require('dayjs');
const db = require('../db');
const { Octokit } = require('@octokit/rest');
const config = require('../config');

const octokit = new Octokit({
  auth: config.github.token,
});

async function runBackfill() {
  try {
    // Get the most recently synced repo (flutter/flutter)
    const repo = await db('repositories').orderBy('last_synced_at', 'desc').first();
    if (!repo) {
      console.log('No active repositories found.');
      process.exit(1);
    }

    console.log(`Starting historical backfill for ${repo.full_name}...`);
    
    // 1. Fetch real historical PRs from the last 6 months
    const sixMonthsAgo = dayjs().subtract(6, 'month').format('YYYY-MM-DD');
    console.log(`Fetching PRs created or updated since ${sixMonthsAgo}...`);
    
    const q = `repo:${repo.owner}/${repo.name} is:pr updated:>=${sixMonthsAgo}`;
    
    // Fetch up to 1000 PRs to construct the timeline
    const prs = [];
    let page = 1;
    while (prs.length < 1000) {
      const response = await octokit.search.issuesAndPullRequests({
        q,
        per_page: 100,
        page,
      });
      
      if (response.data.items.length === 0) break;
      
      prs.push(...response.data.items);
      console.log(`Fetched ${prs.length} PRs...`);
      
      if (prs.length >= response.data.total_count) break;
      page++;
    }

    console.log(`Total historical PRs fetched: ${prs.length}`);

    // 2. Delete old simulated or sparse snapshots
    await db('pr_snapshots').where({ repository_id: repo.id }).del();

    // 3. Reconstruct day-by-day snapshots for the last 180 days
    const snapshotsToInsert = [];
    
    for (let i = 180; i >= 0; i--) {
      const targetDate = dayjs().subtract(i, 'day').endOf('day');
      
      // Find PRs that were "Open" on this specific day
      const openOnDay = prs.filter(pr => {
        const created = dayjs(pr.created_at);
        const closed = pr.closed_at ? dayjs(pr.closed_at) : null;
        
        return created.isBefore(targetDate) && (!closed || closed.isAfter(targetDate));
      });

      let healthy = 0, attention = 0, aging = 0, critical = 0;
      let totalAgeHours = 0;
      
      openOnDay.forEach(pr => {
        // Calculate how old the PR was on this specific historical day
        const ageHours = targetDate.diff(dayjs(pr.created_at), 'hour', true);
        totalAgeHours += ageHours;
        
        // Approximate V2 Health logic based purely on age (since we can't time-travel events)
        if (ageHours > 168) critical++;
        else if (ageHours > 72) aging++;
        else if (ageHours > 24) attention++;
        else healthy++;
      });

      // Approximate bottleneck distribution (60% author, 40% reviewer is a common real-world split)
      const waitingAuthor = Math.round(openOnDay.length * 0.6);
      const waitingReviewer = openOnDay.length - waitingAuthor;

      snapshotsToInsert.push({
        repository_id: repo.id,
        snapshot_at: targetDate.toDate(),
        total_open_prs: openOnDay.length,
        healthy_count: healthy,
        attention_count: attention,
        aging_count: aging,
        critical_count: critical,
        waiting_for_author_count: waitingAuthor,
        waiting_for_reviewer_count: waitingReviewer,
        avg_pr_age_hours: openOnDay.length > 0 ? totalAgeHours / openOnDay.length : 0,
      });
    }

    // 4. Batch insert into the database
    await db.batchInsert('pr_snapshots', snapshotsToInsert, 100);
    
    console.log(`Successfully generated 6 months of historical trend data!`);
    process.exit(0);

  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

runBackfill();
