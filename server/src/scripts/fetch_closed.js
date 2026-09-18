const db = require('../db');
const github = require('../services/github');
const sync = require('../services/sync');

async function importClosedPRs() {
  try {
    const repoId = 3; // flutter
    const repo = await db('repositories').where({ id: repoId }).first();
    
    console.log('Fetching closed PRs for flutter/flutter...');
    const closedPRs = await github.fetchPullRequests(repo.owner, repo.name, 'closed', 20); // Just grab 20 closed PRs
    
    for (const ghPR of closedPRs) {
      // Just do a basic insert for the closed PRs so they appear in the UI
      const prData = {
        repository_id: repoId,
        github_pr_id: ghPR.id,
        number: ghPR.number,
        title: ghPR.title,
        url: ghPR.html_url,
        api_url: ghPR.url,
        author_login: ghPR.user?.login || 'unknown',
        state: 'closed',
        is_merged: !!ghPR.merged_at,
        created_at: ghPR.created_at,
        updated_at: ghPR.updated_at,
        closed_at: ghPR.closed_at,
        merged_at: ghPR.merged_at,
        health_status: 'on_track',
      };
      
      const existing = await db('pull_requests').where({ repository_id: repoId, number: ghPR.number }).first();
      if (!existing) {
        await db('pull_requests').insert(prData);
        console.log(`Inserted closed PR #${ghPR.number}`);
      }
    }
    console.log('Done importing closed PRs');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

importClosedPRs();
