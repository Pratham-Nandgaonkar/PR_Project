# PR Reviews - Aging Scraper

An evidence-based PR aging intelligence and accountability system that analyzes GitHub Pull Requests to identify aging, review delays, bottlenecks, and determine WHO is currently responsible for delays.

## Features

- **PR Aging Classification** — Automatically categorizes PRs as Healthy, Attention, Aging, or Critical
- **Evidence-Based Responsibility** — Determines who is blocking a PR and explains WHY with timeline evidence
- **Review Cycle Analysis** — Tracks review/response cycles with timing metrics
- **Historical Trends** — Stores snapshots for trend visualization
- **People Analytics** — Reviewer and author performance metrics
- **Automatic Sync** — Syncs with GitHub every 6 hours
- **Manager Dashboard** — Clean, actionable overview of PR health

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  React SPA  │────▶│  Express API │────▶│ PostgreSQL │
│  (Vite)     │     │  + Engines   │     │            │
└─────────────┘     └──────┬───────┘     └────────────┘
                           │
                    ┌──────▼───────┐
                    │  GitHub API  │
                    │  (Octokit)   │
                    └──────────────┘
```

### Key Components

| Component | Purpose |
|-----------|--------|
| **Responsibility Engine** | Walks PR timeline to determine current blocker |
| **Aging Engine** | Classifies PR health based on age, wait time, review cycles |
| **Review Cycle Analyzer** | Detects review/response cycles with timing |
| **Sync Service** | Fetches GitHub data, runs analysis, stores snapshots |
| **Scheduler** | Triggers 6-hour automatic syncs via node-cron |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TailwindCSS, Recharts, React Router |
| Backend | Node.js, Express, Knex.js |
| Database | PostgreSQL |
| GitHub | Octokit REST API |
| Scheduling | node-cron |

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+
- **npm** 8+

## Quick Start

### 1. Install Dependencies

```bash
# From project root
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Create Database

```bash
createdb pr_aging_scraper
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your database URL. Optionally add a GitHub token for higher rate limits.

### 4. Run Migrations

```bash
cd server && npx knex migrate:latest
```

### 5. Start Development Servers

```bash
# Terminal 1 — Backend (port 3001)
cd server && npm run dev

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

### 6. Configure a Repository

1. Open http://localhost:5173
2. Navigate to **Settings**
3. Add a repository (e.g., Owner: `facebook`, Name: `react`)
4. Click **Sync Now** to fetch PR data

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/pr_aging_scraper` | Yes |
| `PORT` | Backend server port | `3001` | No |
| `GITHUB_TOKEN` | GitHub personal access token | — | No (recommended) |
| `SYNC_CRON` | Cron expression for auto-sync | `0 */6 * * *` | No |
| `PR_FETCH_LIMIT` | Max PRs to fetch per sync | `100` | No |
| `LOG_LEVEL` | Logging level | `info` | No |

## GitHub API Rate Limits

| Mode | Rate Limit | Practical Capacity |
|------|-----------|--------------------|
| Without token | 60 requests/hour | ~15 PRs per sync |
| With token | 5,000 requests/hour | Hundreds of PRs |

To create a token: [github.com/settings/tokens](https://github.com/settings/tokens) — no scopes needed for public repos.

## Database Schema

| Table | Purpose |
|-------|--------|
| `repositories` | Configured GitHub repos to track |
| `pull_requests` | PR metadata + computed aging/responsibility fields |
| `reviews` | Individual reviews submitted on PRs |
| `pr_events` | Timeline events (commits, review requests, etc.) |
| `review_cycles` | Detected review/response cycles with timing |
| `pr_snapshots` | Historical aggregate snapshots for trends |
| `sync_logs` | Audit trail of sync operations |

## Responsibility Engine

The core algorithm determines WHO is currently blocking a PR by walking its timeline:

| State | Meaning | Responsible |
|-------|---------|------------|
| `WAITING_FOR_REVIEW` | Review requested, no response yet | Requested reviewer |
| `CHANGES_REQUESTED` | Reviewer asked for changes, author hasn't responded | PR author |
| `WAITING_FOR_REVIEW` (after push) | Author pushed changes, reviewer hasn't re-reviewed | Reviewer |
| `APPROVED_WAITING_MERGE` | All reviews approved | PR author (to merge) |
| `DRAFT` | PR is in draft state | PR author |
| `NO_REVIEWER` | No reviewer requested | PR author |
| `STALE` | No activity for 14+ days | Last actor |

Every attribution includes a human-readable evidence explanation.

## Aging Classification

| Category | Criteria |
|----------|----------|
| **Healthy** | Age < 24h, wait < 16h |
| **Attention** | Age 1-3 days, wait 16-48h |
| **Aging** | Age 3-7 days, wait 48-72h, or 3+ review cycles |
| **Critical** | Age 7+ days, wait 72h+, or 5+ review cycles |

Draft PRs are capped at "Attention" since they're intentionally work-in-progress.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/repositories` | List configured repos |
| POST | `/api/repositories` | Add a repository |
| DELETE | `/api/repositories/:id` | Remove a repository |
| POST | `/api/sync/:repoId` | Trigger manual sync |
| GET | `/api/sync/:repoId/status` | Sync status & schedule |
| GET | `/api/prs/:repoId` | List PRs (with filters) |
| GET | `/api/prs/:repoId/:number` | PR detail with timeline |
| GET | `/api/analytics/:repoId/summary` | Executive summary metrics |
| GET | `/api/analytics/:repoId/people` | Author/reviewer analytics |
| GET | `/api/analytics/:repoId/trends` | Historical trend data |
| GET | `/api/analytics/:repoId/bottlenecks` | Current bottleneck analysis |

## Testing

```bash
cd server && npm test
```

Tests cover:
- **Responsibility Engine** — 12 test cases covering merged, closed, draft, waiting for review, changes requested, approved, multiple reviewers, multiple cycles, staleness
- **Aging Engine** — 9 test cases covering all severity levels, draft handling, edge cases
- **Review Cycle Detection** — 6 test cases covering empty, single, multi-cycle, comment exclusion

## Known Limitations

- V1 supports one active repository at a time (schema supports multiple)
- No GitHub OAuth (uses public API or personal access token)
- No notifications (dashboard-only output)
- Rate limited without GitHub token for large repos
- Timeline accuracy depends on GitHub API event availability
- Bot accounts are not filtered (may appear in analytics)

## Future Improvements

- Multiple repository support
- GitHub OAuth login
- Slack/email notifications
- Configurable aging thresholds per repository
- Team-level analytics
- AI-assisted PR insights and recommendations
- Export reports (CSV/PDF)
- Custom organizational policies
- Bot filtering

## License

MIT
