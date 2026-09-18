/**
 * Revamp database schema for PR Aging Scraper v2.
 */
exports.up = async function (knex) {
  // --- New Tables ---

  await knex.schema.createTable('pr_reviewers', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.string('reviewer_login', 255).notNullable();
    t.text('reviewer_avatar_url');
    t.integer('assignment_order');
    t.timestamp('assigned_at', { useTz: true });
    t.string('review_state', 50); // PENDING, COMMENTED, APPROVED, CHANGES_REQUESTED, DISMISSED
    t.timestamp('first_reviewed_at', { useTz: true });
    t.timestamp('latest_reviewed_at', { useTz: true });
    t.float('response_time_biz_hours');
    t.boolean('re_review_needed').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index(['pull_request_id']);
    t.index(['reviewer_login']);
  });

  await knex.schema.createTable('pr_comment_threads', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.bigInteger('github_comment_id');
    t.string('author_login', 255);
    t.text('body');
    t.boolean('is_resolved').defaultTo(false);
    t.string('classification', 50); // blocking, question, suggestion, approval, informational
    t.timestamp('created_at', { useTz: true });
    t.text('path');
    t.integer('line');

    t.index(['pull_request_id']);
  });

  await knex.schema.createTable('pr_checks', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.string('check_name', 255);
    t.string('status', 50); // queued, in_progress, completed
    t.string('conclusion', 50); // success, failure, neutral, cancelled, etc.
    t.timestamp('started_at', { useTz: true });
    t.timestamp('completed_at', { useTz: true });
    t.text('details_url');

    t.index(['pull_request_id']);
  });

  await knex.schema.createTable('pr_action_items', (t) => {
    t.increments('id').primary();
    t.integer('pull_request_id').unsigned().notNullable()
      .references('id').inTable('pull_requests').onDelete('CASCADE');
    t.string('action_type', 50); // NEEDS_INITIAL_REVIEW, NEEDS_RE_REVIEW, ADDRESS_COMMENTS, PUSH_CHANGES, FIX_CI, RESOLVE_CONFLICTS, MERGE_READY
    t.string('assignee_login', 255);
    t.text('description');
    t.string('priority', 20); // HIGH, NORMAL, LOW
    t.timestamp('waiting_since', { useTz: true });
    t.float('waiting_biz_hours');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index(['pull_request_id']);
  });

  await knex.schema.createTable('repository_filters', (t) => {
    t.increments('id').primary();
    t.integer('repository_id').unsigned().notNullable()
      .references('id').inTable('repositories').onDelete('CASCADE');
    t.string('filter_type', 50); // author, label, base_branch
    t.string('filter_value', 255);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index(['repository_id']);
  });

  // --- Alter Existing Tables ---

  await knex.schema.alterTable('pull_requests', (t) => {
    t.string('health_status', 20).defaultTo('on_track'); // on_track, needs_attention, at_risk, critical
    t.text('pending_on_summary');
    t.integer('unresolved_comments_count').defaultTo(0);
    t.integer('pending_reviewers_count').defaultTo(0);
    t.integer('approved_reviewers_count').defaultTo(0);
    t.integer('total_reviewers_count').defaultTo(0);
    t.integer('failing_checks_count').defaultTo(0);
    t.integer('passing_checks_count').defaultTo(0);
    t.boolean('has_merge_conflicts').defaultTo(false);
    t.float('business_hours_age');
    t.float('business_hours_waiting');

    // We keep the old columns around for now, but stop updating them, or drop them if preferred.
    // For a clean V2, let's drop the V1 logic columns to avoid confusion.
    t.dropColumn('aging_status');
    t.dropColumn('responsibility_state');
    t.dropColumn('responsible_login');
    t.dropColumn('responsibility_reason');
    t.dropColumn('responsibility_started_at');
  });

  await knex.schema.alterTable('repositories', (t) => {
    t.jsonb('business_hours_config').defaultTo(JSON.stringify({
      timezone: 'UTC',
      workDays: [1, 2, 3, 4, 5],
      workStart: 9,
      workEnd: 18
    }));
    t.jsonb('sync_filters').defaultTo('[]');
  });
};

exports.down = async function (knex) {
  // Revert changes
  await knex.schema.alterTable('repositories', (t) => {
    t.dropColumn('business_hours_config');
    t.dropColumn('sync_filters');
  });

  await knex.schema.alterTable('pull_requests', (t) => {
    t.string('aging_status', 20).defaultTo('healthy');
    t.string('responsibility_state', 50);
    t.string('responsible_login', 255);
    t.text('responsibility_reason');
    t.timestamp('responsibility_started_at', { useTz: true });

    t.dropColumn('health_status');
    t.dropColumn('pending_on_summary');
    t.dropColumn('unresolved_comments_count');
    t.dropColumn('pending_reviewers_count');
    t.dropColumn('approved_reviewers_count');
    t.dropColumn('total_reviewers_count');
    t.dropColumn('failing_checks_count');
    t.dropColumn('passing_checks_count');
    t.dropColumn('has_merge_conflicts');
    t.dropColumn('business_hours_age');
    t.dropColumn('business_hours_waiting');
  });

  await knex.schema.dropTableIfExists('repository_filters');
  await knex.schema.dropTableIfExists('pr_action_items');
  await knex.schema.dropTableIfExists('pr_checks');
  await knex.schema.dropTableIfExists('pr_comment_threads');
  await knex.schema.dropTableIfExists('pr_reviewers');
};
