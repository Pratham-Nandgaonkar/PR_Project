const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeSummary, computePeopleAnalytics, computeBottlenecks, generateHistoricalSnapshots } = require('../engines/analytics');

// GET /api/analytics/:repoId/summary
router.get('/:repoId/summary', async (req, res) => {
  try {
    const { repoId } = req.params;
    const prs = await db('pull_requests').where({ repository_id: repoId });
    const summary = computeSummary(prs);
    res.json(summary);
  } catch (error) {
    console.error('Error computing summary:', error);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

// GET /api/analytics/:repoId/people
router.get('/:repoId/people', async (req, res) => {
  try {
    const { repoId } = req.params;
    const prs = await db('pull_requests').where({ repository_id: repoId });
    const prIds = prs.map(p => p.id);
    const reviews = prIds.length > 0
      ? await db('reviews').whereIn('pull_request_id', prIds)
      : [];
    const result = computePeopleAnalytics(prs, reviews);
    res.json(result);
  } catch (error) {
    console.error('Error computing people analytics:', error);
    res.status(500).json({ error: 'Failed to compute people analytics' });
  }
});

// GET /api/analytics/:repoId/trends
router.get('/:repoId/trends', async (req, res) => {
  try {
    const { repoId } = req.params;
    let snapshots = await db('pr_snapshots')
      .where({ repository_id: repoId })
      .orderBy('snapshot_at', 'asc');

    // If there is not enough historical snapshot data (< 2 snapshots), generate it from PRs
    if (snapshots.length < 2) {
      const repo = await db('repositories').where({ id: repoId }).first();
      const prs = await db('pull_requests').where({ repository_id: repoId });
      if (prs.length > 0) {
        const firstReviews = await db('pr_reviewers')
          .join('pull_requests', 'pr_reviewers.pull_request_id', 'pull_requests.id')
          .where('pull_requests.repository_id', repoId)
          .whereNotNull('pr_reviewers.first_reviewed_at')
          .select('pull_requests.created_at', 'pr_reviewers.first_reviewed_at', 'pr_reviewers.pull_request_id');

        const historical = generateHistoricalSnapshots(prs, firstReviews, parseInt(repoId, 10), 30, repo?.business_hours_config);
        const dayjs = require('dayjs');
        const existingDates = new Set(snapshots.map(s => dayjs(s.snapshot_at).format('YYYY-MM-DD')));
        const toInsert = historical.filter(h => !existingDates.has(dayjs(h.snapshot_at).format('YYYY-MM-DD')));
        if (toInsert.length > 0) {
          await db.batchInsert('pr_snapshots', toInsert, 50);
          snapshots = await db('pr_snapshots')
            .where({ repository_id: repoId })
            .orderBy('snapshot_at', 'asc');
        }
      }
    }

    res.json(snapshots);
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/analytics/:repoId/bottlenecks
router.get('/:repoId/bottlenecks', async (req, res) => {
  try {
    const { repoId } = req.params;
    const prs = await db('pull_requests').where({ repository_id: repoId, state: 'open' });
    const prIds = prs.map(p => p.id);
    const actionItems = prIds.length > 0 
      ? await db('pr_action_items').whereIn('pull_request_id', prIds) 
      : [];
    const bottlenecks = computeBottlenecks(prs, actionItems).slice(0, 10);
    res.json(bottlenecks);
  } catch (error) {
    console.error('Error computing bottlenecks:', error);
    res.status(500).json({ error: 'Failed to compute bottlenecks' });
  }
});

module.exports = router;
