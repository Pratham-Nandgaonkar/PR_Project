const express = require('express');
const router = express.Router();
const db = require('../db');
const dayjs = require('dayjs');

// GET /api/prs/:repoId - List PRs with filtering
router.get('/:repoId', async (req, res) => {
  try {
    const { repoId } = req.params;
    const {
      status = 'open',
      health_status,
      author,
      search,
      sort = 'created_at',
      order = 'desc',
      page = 1,
      limit = 25,
    } = req.query;

    let query = db('pull_requests').where({ repository_id: repoId });

    // Filters
    if (status && status !== 'all') {
      if (status === 'merged') {
        query = query.where({ is_merged: true });
      } else {
        query = query.where({ state: status });
      }
    }
    if (health_status) query = query.where({ health_status });
    if (author) query = query.where({ author_login: author });
    if (search) {
      query = query.where(function () {
        this.where('title', 'ilike', `%${search}%`)
          .orWhere('author_login', 'ilike', `%${search}%`)
          .orWhere(db.raw('number::text'), 'like', `%${search}%`);
      });
    }

    // Get total count
    const [{ count }] = await query.clone().count();
    const total = parseInt(count);

    // Sort
    const sortMap = {
      created_at: 'created_at',
      age: 'created_at',
      activity: 'last_activity_at',
      updated: 'updated_at',
    };
    const sortCol = sortMap[sort] || 'created_at';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    // Paginate
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const data = await query
      .orderBy(sortCol, sortOrder)
      .limit(parseInt(limit))
      .offset(offset);

    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching PRs:', error);
    res.status(500).json({ error: 'Failed to fetch PRs' });
  }
});

// GET /api/prs/:repoId/:number - PR detail
router.get('/:repoId/:number', async (req, res) => {
  try {
    const { repoId, number } = req.params;
    const pr = await db('pull_requests')
      .where({ repository_id: repoId, number: parseInt(number) })
      .first();

    if (!pr) {
      return res.status(404).json({ error: 'PR not found' });
    }

    const reviews = await db('reviews')
      .where({ pull_request_id: pr.id })
      .orderBy('submitted_at', 'asc');

    const events = await db('pr_events')
      .where({ pull_request_id: pr.id })
      .orderBy('created_at', 'asc');

    const reviewCycles = await db('review_cycles')
      .where({ pull_request_id: pr.id })
      .orderBy('cycle_number', 'asc');

    const actionItems = await db('pr_action_items')
      .where({ pull_request_id: pr.id })
      .orderBy('waiting_biz_hours', 'desc');

    const reviewers = await db('pr_reviewers')
      .where({ pull_request_id: pr.id })
      .orderBy('assignment_order', 'asc');

    const commentThreads = await db('pr_comment_threads')
      .where({ pull_request_id: pr.id })
      .orderBy('created_at', 'asc');

    const checks = await db('pr_checks')
      .where({ pull_request_id: pr.id });

    // Build timeline
    const timeline = [];

    // PR created
    timeline.push({
      type: 'pr_created',
      actor: pr.author_login,
      description: 'opened this pull request',
      timestamp: pr.created_at,
    });

    // Reviews
    reviews.forEach(r => {
      const stateLabel = {
        APPROVED: 'approved',
        CHANGES_REQUESTED: 'requested changes',
        COMMENTED: 'commented',
        DISMISSED: 'had their review dismissed',
      }[r.state] || r.state;

      timeline.push({
        type: 'review',
        actor: r.reviewer_login,
        description: stateLabel,
        timestamp: r.submitted_at,
        data: { state: r.state, body: r.body },
      });
    });

    // Events
    events.forEach(e => {
      const descriptions = {
        committed: 'pushed a commit',
        head_ref_force_pushed: 'force-pushed the branch',
        review_requested: 'requested a review',
        review_request_removed: 'removed a review request',
        labeled: 'added a label',
        unlabeled: 'removed a label',
        assigned: 'was assigned',
        unassigned: 'was unassigned',
        milestoned: 'added to milestone',
        demilestoned: 'removed from milestone',
        renamed: 'changed the title',
        ready_for_review: 'marked ready for review',
        convert_to_draft: 'converted to draft',
        merged: 'merged this pull request',
        closed: 'closed this pull request',
        reopened: 'reopened this pull request',
      };

      if (descriptions[e.event_type]) {
        timeline.push({
          type: e.event_type,
          actor: e.actor_login,
          description: descriptions[e.event_type],
          timestamp: e.created_at,
          data: e.data,
        });
      }
    });

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Merged/closed
    if (pr.is_merged && pr.merged_at) {
      timeline.push({
        type: 'merged',
        actor: pr.merged_by || pr.author_login,
        description: 'merged this pull request',
        timestamp: pr.merged_at,
      });
    } else if (pr.state === 'closed' && pr.closed_at) {
      timeline.push({
        type: 'closed',
        actor: pr.author_login,
        description: 'closed this pull request',
        timestamp: pr.closed_at,
      });
    }

    res.json({
      pr,
      reviews,
      events,
      reviewCycles,
      timeline,
      actionItems,
      reviewers,
      commentThreads,
      checks
    });
  } catch (error) {
    console.error('Error fetching PR detail:', error);
    res.status(500).json({ error: 'Failed to fetch PR detail' });
  }
});

module.exports = router;
