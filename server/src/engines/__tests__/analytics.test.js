const { generateHistoricalSnapshots, computeSummary } = require('../analytics');

describe('Analytics Engine - generateHistoricalSnapshots', () => {
  it('should return empty array when prs is empty', () => {
    const snapshots = generateHistoricalSnapshots([], [], 1);
    expect(snapshots).toEqual([]);
  });

  it('should generate historical daily snapshots from PRs', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const mockPRs = [
      {
        id: 1,
        repository_id: 1,
        created_at: tenDaysAgo,
        closed_at: null,
        is_draft: false,
        pending_on_summary: 'Waiting for Author',
      },
      {
        id: 2,
        repository_id: 1,
        created_at: tenDaysAgo,
        closed_at: fiveDaysAgo,
        is_draft: false,
        pending_on_summary: 'Waiting for Reviewer',
      },
    ];

    const snapshots = generateHistoricalSnapshots(mockPRs, [], 1, 10);

    expect(snapshots.length).toBeGreaterThanOrEqual(7);

    // On a day before PR #2 was closed (e.g. 7 days ago), both PRs should be open (total = 2)
    const day7 = snapshots.find(s => {
      const snapDate = new Date(s.snapshot_at);
      const daysDiff = (now - snapDate) / (1000 * 60 * 60 * 24);
      return Math.round(daysDiff) === 7;
    });
    if (day7) {
      expect(day7.total_open_prs).toBe(2);
    }

    // On a day after PR #2 was closed (e.g. 2 days ago), only PR #1 should be open (total = 1)
    const day2 = snapshots.find(s => {
      const snapDate = new Date(s.snapshot_at);
      const daysDiff = (now - snapDate) / (1000 * 60 * 60 * 24);
      return Math.round(daysDiff) === 2;
    });
    if (day2) {
      expect(day2.total_open_prs).toBe(1);
    }
  });
});
