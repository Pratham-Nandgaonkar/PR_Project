const cron = require('node-cron');
const config = require('../config');
const db = require('../db');
const { synchronizeRepository } = require('./sync');

let cronJob = null;
let isRunning = false;
let lastSyncTime = null;
let nextSyncTime = null;

function calculateNextSync() {
  // Simple: add 6 hours from now (matches default cron)
  const next = new Date();
  next.setHours(next.getHours() + 6);
  return next;
}

function startScheduler() {
  const cronExpr = config.sync.cronExpression;
  console.log(`[Scheduler] Starting with cron: ${cronExpr}`);

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression: ${cronExpr}`);
    return;
  }

  cronJob = cron.schedule(cronExpr, async () => {
    if (isRunning) {
      console.log('[Scheduler] Sync already running, skipping');
      return;
    }
    await syncAllRepositories();
  });

  nextSyncTime = calculateNextSync();
  console.log('[Scheduler] Started successfully');
}

function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

async function syncAllRepositories() {
  isRunning = true;
  try {
    const repos = await db('repositories').where({ is_active: true });
    for (const repo of repos) {
      console.log(`[Scheduler] Syncing ${repo.full_name}...`);
      await synchronizeRepository(repo.id);
    }
    lastSyncTime = new Date();
    nextSyncTime = calculateNextSync();
  } catch (error) {
    console.error('[Scheduler] Error:', error.message);
  } finally {
    isRunning = false;
  }
}

async function triggerManualSync(repositoryId) {
  if (isRunning) {
    throw new Error('Sync is already in progress');
  }
  isRunning = true;
  try {
    await synchronizeRepository(repositoryId);
    lastSyncTime = new Date();
    nextSyncTime = calculateNextSync();
  } finally {
    isRunning = false;
  }
}

function getScheduleStatus() {
  return {
    lastSync: lastSyncTime,
    nextSync: nextSyncTime,
    isRunning,
  };
}

module.exports = { startScheduler, stopScheduler, triggerManualSync, getScheduleStatus };
