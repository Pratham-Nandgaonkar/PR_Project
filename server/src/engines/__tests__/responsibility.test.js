const { determineResponsibility, checkStaleness } = require('../responsibility');

describe('Responsibility Engine', () => {
  const BASE_DATE = '2024-01-15T10:00:00Z';

  function makeDate(hoursOffset) {
    const d = new Date(BASE_DATE);
    d.setHours(d.getHours() + hoursOffset);
    return d.toISOString();
  }

  function makePR(overrides = {}) {
    return {
      state: 'open',
      is_merged: false,
      is_draft: false,
      author_login: 'author1',
      created_at: BASE_DATE,
      updated_at: makeDate(1),
      requested_reviewers: JSON.stringify(['reviewer1']),
      merged_at: null,
      closed_at: null,
      ...overrides,
    };
  }

  describe('Closed states', () => {
    it('should identify merged PR', () => {
      const pr = makePR({ state: 'closed', is_merged: true, merged_at: makeDate(48) });
      const result = determineResponsibility(pr, [], []);
      expect(result.state).toBe('MERGED');
      expect(result.responsibleLogin).toBeNull();
    });

    it('should identify closed without merge', () => {
      const pr = makePR({ state: 'closed', is_merged: false, closed_at: makeDate(48) });
      const result = determineResponsibility(pr, [], []);
      expect(result.state).toBe('CLOSED');
      expect(result.responsibleLogin).toBeNull();
    });
  });

  describe('Draft PRs', () => {
    it('should identify draft PR as author responsibility', () => {
      const pr = makePR({ is_draft: true });
      const result = determineResponsibility(pr, [], []);
      expect(result.state).toBe('DRAFT');
      expect(result.responsibleLogin).toBe('author1');
      expect(result.reason).toContain('draft');
    });
  });

  describe('Waiting for review', () => {
    it('should identify PR waiting for reviewer when no reviews exist', () => {
      const pr = makePR();
      const result = determineResponsibility(pr, [], []);
      expect(result.state).toBe('WAITING_FOR_REVIEW');
      expect(result.responsibleLogin).toBe('reviewer1');
      expect(result.reason).toContain('no review has been submitted');
    });

    it('should identify PR waiting for reviewer after author pushes changes', () => {
      const pr = makePR();
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(24), body: 'Fix this' },
      ];
      const events = [
        { event_type: 'committed', actor_login: 'author1', created_at: makeDate(30), data: {} },
      ];
      const result = determineResponsibility(pr, reviews, events);
      expect(result.state).toBe('WAITING_FOR_REVIEW');
      expect(result.responsibleLogin).toBe('reviewer1');
      expect(result.reason).toContain('pushed changes');
      expect(result.reason).toContain('re-review');
    });
  });

  describe('Changes requested', () => {
    it('should identify author responsibility when changes requested and no response', () => {
      const pr = makePR();
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(24), body: 'Fix bugs' },
      ];
      const events = [];
      const result = determineResponsibility(pr, reviews, events);
      expect(result.state).toBe('CHANGES_REQUESTED');
      expect(result.responsibleLogin).toBe('author1');
      expect(result.reason).toContain('requested changes');
      expect(result.reason).toContain('has not pushed updates');
    });
  });

  describe('Approved', () => {
    it('should identify approved PR waiting for merge', () => {
      const pr = makePR({ requested_reviewers: '[]' });
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(24), body: 'LGTM' },
      ];
      const result = determineResponsibility(pr, reviews, []);
      expect(result.state).toBe('APPROVED_WAITING_MERGE');
      expect(result.responsibleLogin).toBe('author1');
      expect(result.reason).toContain('approved');
    });

    it('should identify pending reviewers when one approved but another pending', () => {
      const pr = makePR({ requested_reviewers: JSON.stringify(['reviewer2']) });
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(24), body: 'LGTM' },
      ];
      const result = determineResponsibility(pr, reviews, []);
      expect(result.state).toBe('WAITING_FOR_REVIEW');
      expect(result.responsibleLogin).toBe('reviewer2');
      expect(result.reason).toContain('reviewer2');
    });
  });

  describe('No reviewer', () => {
    it('should identify no reviewer assigned', () => {
      const pr = makePR({ requested_reviewers: '[]' });
      const result = determineResponsibility(pr, [], []);
      expect(result.state).toBe('NO_REVIEWER');
      expect(result.responsibleLogin).toBe('author1');
      expect(result.reason).toContain('No reviewer');
    });
  });

  describe('Multiple review cycles', () => {
    it('should track latest CHANGES_REQUESTED when multiple cycles exist', () => {
      const pr = makePR();
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(10), body: 'Fix A' },
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(30), body: 'Fix B' },
      ];
      const events = [
        { event_type: 'committed', actor_login: 'author1', created_at: makeDate(15), data: {} },
      ];
      // Latest review is second CHANGES_REQUESTED at +30h. Author committed at +15h which is BEFORE the second review.
      const result = determineResponsibility(pr, reviews, events);
      expect(result.state).toBe('CHANGES_REQUESTED');
      expect(result.responsibleLogin).toBe('author1');
    });

    it('should detect author response to latest change request', () => {
      const pr = makePR();
      const reviews = [
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(10), body: 'Fix A' },
        { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(30), body: 'Fix B' },
      ];
      const events = [
        { event_type: 'committed', actor_login: 'author1', created_at: makeDate(15), data: {} },
        { event_type: 'committed', actor_login: 'author1', created_at: makeDate(35), data: {} },
      ];
      // Latest review at +30h, author committed at +35h -> waiting for reviewer
      const result = determineResponsibility(pr, reviews, events);
      expect(result.state).toBe('WAITING_FOR_REVIEW');
      expect(result.responsibleLogin).toBe('reviewer1');
    });
  });

  describe('Staleness', () => {
    it('should mark stale PR when no activity for 14+ days', () => {
      const pr = makePR({
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      });
      const events = [
        { event_type: 'committed', actor_login: 'author1', created_at: '2024-01-01T10:00:00Z', data: {} },
      ];
      let result = determineResponsibility(pr, [], events);
      result = checkStaleness(result, pr, events);
      expect(result.state).toBe('STALE');
      expect(result.reason).toContain('stale');
    });
  });
});
