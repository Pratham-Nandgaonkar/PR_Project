const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/repositories', require('./routes/repositories'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/prs', require('./routes/prs'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(config.port, () => {
  console.log(`PR Aging Scraper API running on port ${config.port}`);
  // Start scheduler
  const scheduler = require('./services/scheduler');
  scheduler.startScheduler();
});

module.exports = app;
