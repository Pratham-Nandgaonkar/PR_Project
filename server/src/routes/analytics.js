const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeSummary, computePeopleAnalytics, computeBottlenecks } = require('../engines/analytics');

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
    const snapshots = await db('pr_snapshots')
      .where({ repository_id: repoId })
      .orderBy('snapshot_at', 'asc');
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
    const bottlenecks = computeBottlenecks(prs);
    res.json(bottlenecks);
  } catch (error) {
    console.error('Error computing bottlenecks:', error);
    res.status(500).json({ error: 'Failed to compute bottlenecks' });
  }
});

module.exports = router;
