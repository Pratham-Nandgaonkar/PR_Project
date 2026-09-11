const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/repositories
router.get('/', async (req, res) => {
  try {
    const repos = await db('repositories').orderBy('created_at', 'desc');
    res.json(repos);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// POST /api/repositories
router.post('/', async (req, res) => {
  try {
    const { owner, name } = req.body;
    if (!owner || !name) {
      return res.status(400).json({ error: 'Owner and name are required' });
    }

    // Validate format
    const validPattern = /^[a-zA-Z0-9._-]+$/;
    if (!validPattern.test(owner) || !validPattern.test(name)) {
      return res.status(400).json({ error: 'Invalid owner or repository name format' });
    }

    // Check uniqueness
    const existing = await db('repositories').where({ owner, name }).first();
    if (existing) {
      return res.status(409).json({ error: 'Repository already configured' });
    }

    const [repo] = await db('repositories').insert({
      owner,
      name,
      full_name: `${owner}/${name}`,
      is_active: true,
    }).returning('*');

    res.status(201).json(repo);
  } catch (error) {
    console.error('Error adding repository:', error);
    res.status(500).json({ error: 'Failed to add repository' });
  }
});

// DELETE /api/repositories/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db('repositories').where({ id }).del();
    if (!deleted) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

module.exports = router;
