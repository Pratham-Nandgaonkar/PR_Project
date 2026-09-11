const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pr_aging_scraper',

  github: {
    token: process.env.GITHUB_TOKEN || null,
    prFetchLimit: parseInt(process.env.PR_FETCH_LIMIT, 10) || 100,
  },

  sync: {
    cronExpression: process.env.SYNC_CRON || '0 */6 * * *',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
