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

### 2. Create PostgreSQL Database

Open your terminal or command prompt and log into PostgreSQL using the `psql` command-line tool:

```bash
psql -U postgres
```

When prompted, enter your PostgreSQL password. Once inside the PostgreSQL command prompt (`postgres=#`), run the query to create the database:

```sql
CREATE DATABASE pr_aging_scraper;
```

*(Optional) You can verify the database with `\l`.* Then exit the `psql` prompt:

```sql
\q
```

### 3. Configure Environment Variables (`.env`)

Copy the example environment configuration to create your `.env` file in the project root:

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell)
copy .env.example .env
```

Open the newly created `.env` file and configure the following:

#### A. Database Connection
Ensure `DATABASE_URL` matches your PostgreSQL username, password, host, and database:
```env
DATABASE_URL=postgres://postgres:your_password@localhost:5432/pr_aging_scraper
```

#### B. Create & Add Your Own GitHub Token (Highly Recommended)
* Without a personal access token, GitHub restricts unauthenticated requests to only **60 requests/hour**, which will quickly exhaust rate limits during repository syncs.
* Adding a token increases your rate limit to **5,000 requests/hour**.
* **Steps to create your token:**
  1. Visit [GitHub Token Settings](https://github.com/settings/tokens) (or go to GitHub **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)**).
  2. Click **Generate new token (classic)**.
  3. Give it a descriptive note (e.g. `PR-Aging-Scraper`) and choose an expiration duration.
  4. For public repositories, no specific scopes are required. (For private repositories, check the `repo` scope).
  5. Click **Generate token** and copy the generated token string.
  6. Paste it into your `.env` file:
     ```env
     GITHUB_TOKEN=ghp_yourGeneratedTokenHere...
     ```

#### C. Check and Configure PR Fetch Limit (`PR_FETCH_LIMIT`)
* Determine how many pull requests you want to ingest and analyze per repository.
* Default is `100`. If you want to fetch and analyze more PRs (e.g., 500 or 1000), update `PR_FETCH_LIMIT`:
  ```env
  PR_FETCH_LIMIT=500
  ```

### 4. Run Database Migrations

Run Knex migrations from the server directory to create all required database tables:

```bash
cd server && npx knex migrate:latest
```

### 5. Start Development Servers

Run both the backend API and frontend Vite development server:

```bash
# Terminal 1 — Backend API (port 3001)
cd server && npm run dev

# Terminal 2 — Frontend UI (port 5173)
cd client && npm run dev
```

### 6. Access the Application

Open your browser and navigate to **http://localhost:5173**.

---

## How to Use

### 1. Adding and Syncing a Repository
1. Navigate to the **Settings** tab in the sidebar.
2. In the **Add Repository** form, enter the repository **Owner** (e.g. `expressjs`) and **Repository Name** (e.g. `express`).
3. Click **Add**. The backend immediately validates the repository with GitHub's API to confirm it exists.
4. Once added, an initial sync triggers automatically (or you can click the **Sync Now** button / refresh icon anytime).

> **Important — Wait a few minutes while fetching data:**
> When syncing is triggered, the system fetches up to your configured `PR_FETCH_LIMIT` (e.g. 100 to 500+ PRs) alongside commit histories, reviews, comments, and CI check runs from the GitHub REST API.
> **Please wait a few minutes while data is being fetched.** You will see an animated spinning indicator and `Syncing...` status. Once the sync finishes, the status updates to `Idle` with the timestamp, and all dashboard metrics will be fully populated.

### 2. Monitoring the Dashboard
* **Dashboard (`/`)**: Provides an executive overview of your repository health:
  * **Summary Metric Cards**: Total Open PRs, Merged/Closed PRs, Critical/At Risk PR counts, Waiting for Review vs. Waiting for Author breakdown, and Average PR Age.
  * **PR Health Distribution**: Visual breakdown of PRs classified as On Track (green), Needs Attention (yellow), At Risk (orange), or Critical (red).
  * **Responsibility Distribution**: Identifies whether blockers are waiting on authors or reviewers.
  * **Top Bottlenecks**: Highlights the top 10 PRs causing the longest delays with clear action items and descriptions.

### 3. Inspecting PRs & Evidence Timelines
* **Pull Requests (`/prs`)**: Search and filter open PRs by author, status, or search keywords.
* **PR Detail Page (`/prs/:number`)**: Click on any PR number to view its full evidence-based breakdown:
  * **Action Items & Blockers**: Explains exactly WHO is responsible for next steps and WHY.
  * **Review Cycles**: Visual timeline of all review cycles (review submitted -> author responded -> next review).
  * **Timeline Events**: Full audit trail of review submissions, commits, comments, and state changes.

### 4. Viewing People & Trends Analytics
* **People Analytics (`/people`)**:
  * **Reviewer Performance**: Identifies review volume, average turnaround time, and review cycle counts.
  * **Author Responsiveness**: Measures how quickly authors address feedback and push fixes.
* **Historical Trends (`/trends`)**:
  * 30-day historical aggregate snapshots tracking PR aging trends, open PR volume over time, health category distribution, and time-to-first-review.

### 5. Customizing Business Hours & Work Days
1. In the **Settings** tab, click on your repository in the **Current Repositories** table to select it.
2. Scroll to the **Business Hours Configuration** section:
   * **Timezone**: Select your team's operating timezone (e.g. `UTC`, `America/New_York`, `Asia/Kolkata`).
   * **Work Days**: Click on the day bubbles (`M`, `T`, `W`, `T`, `F`, `S`, `S`) to select which days are considered working days (e.g. Mon–Fri vs. weekend days).
   * **Start & End Time**: Set daily working hours in 24-hour format (e.g., 9 to 18).
   * Notice the live summary displaying active days and total business hours per week (e.g. `5 active work days/week • 9 hrs/day • 45 business hrs/week`).
3. Click **Save Changes** (or **Save Settings**). All pull request ages, waiting times, health statuses, and historical snapshots will instantly recalculate to reflect your new working calendar.

---

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
