/**
 * Initial database schema for PR Aging Scraper.
 * 
 * Tables:
 * - repositories: Configured GitHub repos to track
 * - pull_requests: PR metadata + computed aging/responsibility fields
 * - reviews: Individual reviews on PRs
 * - pr_events: Timeline events (commits, review requests, pushes, etc.)
 * - review_cycles: Detected review/response cycles with timing
 * - pr_snapshots: Historical aggregate snapshots for trends
 * - sync_logs: Audit trail of sync operations
 */
exports.up = async function (knex) {
  // --- repositories ---
  await knex.schema.createTable('repositories', (t) => {
    t.increments('id').primary();
    t.string('owner', 255).notNullable();
    t.string('name', 255).notNullable();
    t.string('full_name', 511).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamp('last_synced_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['owner', 'name']);
  });

  // --- pull_requests ---
  await knex.schema.createTable('pull_requests', (t) => {
    t.increments('id').primary();
    t.integer('repository_id').unsigned().notNullable()
      .references('id').inTable('repositories').onDelete('CASCADE');
    t.bigInteger('github_pr_id').notNullable();
    t.integer('number').notNullable();
    t.text('title');
    t.text('url');
    t.text('api_url');
    t.string('author_login', 255);
    t.text('author_avatar_url');
    t.string('state', 20); // open, closed
    t.boolean('is_draft').defaultTo(false);
    t.boolean('is_merged').defaultTo(false);
    t.timestamp('created_at', { useTz: true });
    t.timestamp('updated_at', { useTz: true });
    t.timestamp('closed_at', { useTz: true });
    t.timestamp('merged_at', { useTz: true });
    t.string('merged_by', 255);
    t.string('head_ref', 255);
    t.string('base_ref', 255);
    t.integer('commits_count').defaultTo(0);
    t.integer('changed_files_count').defaultTo(0);
    t.integer('additions').defaultTo(0);
    t.integer('deletions').defaultTo(0);
    t.jsonb('labels').defaultTo('[]');
    t.jsonb('assignees').defaultTo('[]');
    t.jsonb('requested_reviewers').defaultTo('[]');
    t.jsonb('requested_teams').defaultTo('[]');
    t.integer('comments_count').defaultTo(0);
    t.integer('review_comments_count').defaultTo(0);

    // Computed analysis fields
    t.string('aging_status', 20).defaultTo('healthy'); // healthy, attention, aging, critical
    t.string('responsibility_state', 50); // waiting_for_author, waiting_for_review, etc.
    t.string('responsible_login', 255);
    t.text('responsibility_reason');
    t.timestamp('responsibility_started_at', { useTz: true });
    t.integer('review_cycles_count').defaultTo(0);
    t.float('avg_review_cycle_hours');
    t.timestamp('first_review_at', { useTz: true });
    t.timestamp('first_approval_at', { useTz: true });
    t.timestamp('last_activity_at', { useTz: true });
    t.timestamp('last_analyzed_at', { useTz: true });

    t.unique(['repository_id', 'number']);
    t.index(['repository_id', 'state']);
    t.index(['repository_id', 'aging_status']);
    t.index(['responsibility_state']);
  });

  // --- reviews ---
  await knex.schema.createTable('reviews', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.bigInteger('github_review_id');
    t.string('reviewer_login', 255);
    t.string('state', 30); // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
    t.text('body');
    t.timestamp('submitted_at', { useTz: true });

    t.index(['pull_request_id', 'submitted_at']);
    t.index(['reviewer_login']);
  });

  // --- pr_events ---
  await knex.schema.createTable('pr_events', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.bigInteger('github_event_id');
    t.string('event_type', 50); // committed, review_requested, head_ref_force_pushed, etc.
    t.string('actor_login', 255);
    t.timestamp('created_at', { useTz: true });
    t.jsonb('data').defaultTo('{}');

    t.index(['pull_request_id', 'created_at']);
    t.index(['event_type']);
  });

  // --- review_cycles ---
  await knex.schema.createTable('review_cycles', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.integer('cycle_number').notNullable();
    t.timestamp('started_at', { useTz: true });
    t.timestamp('ended_at', { useTz: true });
    t.timestamp('review_submitted_at', { useTz: true });
    t.string('reviewer_login', 255);
    t.string('review_state', 30);
    t.timestamp('author_responded_at', { useTz: true });
    t.float('reviewer_response_hours');
    t.float('author_response_hours');
    t.integer('commits_in_cycle').defaultTo(0);

    t.index(['pull_request_id', 'cycle_number']);
  });

  // --- pr_snapshots ---
  await knex.schema.createTable('pr_snapshots', (t) => {
    t.increments('id').primary();
    t.integer('repository_id').unsigned().notNullable()
      .references('id').inTable('repositories').onDelete('CASCADE');
    t.timestamp('snapshot_at', { useTz: true }).notNullable();
    t.integer('total_open_prs').defaultTo(0);
    t.integer('healthy_count').defaultTo(0);
    t.integer('attention_count').defaultTo(0);
    t.integer('aging_count').defaultTo(0);
    t.integer('critical_count').defaultTo(0);
    t.integer('waiting_for_author_count').defaultTo(0);
    t.integer('waiting_for_reviewer_count').defaultTo(0);
    t.float('avg_pr_age_hours');
    t.float('avg_review_time_hours');
    t.float('avg_first_review_hours');
    t.float('median_merge_time_hours');
    t.jsonb('details').defaultTo('{}');

    t.index(['repository_id', 'snapshot_at']);
  });

  // --- sync_logs ---
  await knex.schema.createTable('sync_logs', (t) => {
    t.increments('id').primary();
    t.integer('repository_id').unsigned().notNullable()
      .references('id').inTable('repositories').onDelete('CASCADE');
    t.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true });
    t.string('status', 20).defaultTo('running'); // running, completed, failed
    t.integer('prs_fetched').defaultTo(0);
    t.integer('prs_updated').defaultTo(0);
    t.integer('api_calls_made').defaultTo(0);
    t.integer('rate_limit_remaining');
    t.text('error_message');

    t.index(['repository_id', 'started_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('sync_logs');
  await knex.schema.dropTableIfExists('pr_snapshots');
  await knex.schema.dropTableIfExists('review_cycles');
  await knex.schema.dropTableIfExists('pr_events');
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('pull_requests');
  await knex.schema.dropTableIfExists('repositories');
};
