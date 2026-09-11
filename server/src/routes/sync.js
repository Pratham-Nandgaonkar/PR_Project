const express = require('express');
const router = express.Router();
const db = require('../db');
const scheduler = require('../services/scheduler');

// POST /api/sync/:repoId - Trigger manual sync
router.post('/:repoId', async (req, res) => {
  try {
    const { repoId } = req.params;
    const repo = await db('repositories').where({ id: repoId }).first();
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const status = scheduler.getScheduleStatus();
    if (status.isRunning) {
      return res.status(409).json({ error: 'Sync is already in progress' });
    }

    // Trigger async - don't await
    scheduler.triggerManualSync(parseInt(repoId)).catch(err => {
      console.error('[Sync] Manual sync failed:', err.message);
    });

    res.status(202).json({ message: 'Sync started', repoId });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// GET /api/sync/:repoId/status
router.get('/:repoId/status', async (req, res) => {
  try {
    const { repoId } = req.params;
    const status = scheduler.getScheduleStatus();

    const latestLog = await db('sync_logs')
      .where({ repository_id: repoId })
      .orderBy('started_at', 'desc')
      .first();

    const repo = await db('repositories').where({ id: repoId }).first();

    res.json({
      ...status,
      lastSync: repo?.last_synced_at || status.lastSync,
      latestLog: latestLog || null,
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

module.exports = router;
