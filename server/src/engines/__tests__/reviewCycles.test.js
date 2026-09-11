const { detectReviewCycles } = require('../reviewCycles');

describe('Review Cycle Detection', () => {
  const BASE_DATE = '2024-01-15T10:00:00Z';

  function makeDate(hoursOffset) {
    const d = new Date(BASE_DATE);
    d.setHours(d.getHours() + hoursOffset);
    return d.toISOString();
  }

  const basePR = {
    created_at: BASE_DATE,
    author_login: 'author1',
  };

  it('should return empty array when no reviews', () => {
    const result = detectReviewCycles(basePR, [], []);
    expect(result).toEqual([]);
  });

  it('should detect single approval cycle', () => {
    const reviews = [
      { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(24) },
    ];
    const result = detectReviewCycles(basePR, reviews, []);
    expect(result).toHaveLength(1);
    expect(result[0].cycleNumber).toBe(1);
    expect(result[0].reviewerLogin).toBe('reviewer1');
    expect(result[0].reviewState).toBe('APPROVED');
    expect(result[0].reviewerResponseHours).toBeCloseTo(24, 0);
  });

  it('should detect changes requested then approval as two cycles', () => {
    const reviews = [
      { reviewer_login: 'reviewer1', state: 'CHANGES_REQUESTED', submitted_at: makeDate(24) },
      { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(48) },
    ];
    const events = [
      { event_type: 'committed', actor_login: 'author1', created_at: makeDate(30) },
    ];
    const result = detectReviewCycles(basePR, reviews, events);
    expect(result).toHaveLength(2);
    expect(result[0].reviewState).toBe('CHANGES_REQUESTED');
    expect(result[1].reviewState).toBe('APPROVED');
    expect(result[0].authorResponseHours).toBeCloseTo(6, 0);
  });

  it('should exclude COMMENTED reviews from cycles', () => {
    const reviews = [
      { reviewer_login: 'reviewer1', state: 'COMMENTED', submitted_at: makeDate(12) },
      { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(24) },
    ];
    const result = detectReviewCycles(basePR, reviews, []);
    expect(result).toHaveLength(1);
    expect(result[0].reviewState).toBe('APPROVED');
  });

  it('should handle multiple reviewers', () => {
    const reviews = [
      { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(20) },
      { reviewer_login: 'reviewer2', state: 'CHANGES_REQUESTED', submitted_at: makeDate(24) },
    ];
    const result = detectReviewCycles(basePR, reviews, []);
    expect(result).toHaveLength(2);
    expect(result[0].reviewerLogin).toBe('reviewer1');
    expect(result[1].reviewerLogin).toBe('reviewer2');
  });

  it('should calculate commit counts in cycles', () => {
    const reviews = [
      { reviewer_login: 'reviewer1', state: 'APPROVED', submitted_at: makeDate(24) },
    ];
    const events = [
      { event_type: 'committed', actor_login: 'author1', created_at: makeDate(2) },
      { event_type: 'committed', actor_login: 'author1', created_at: makeDate(5) },
      { event_type: 'committed', actor_login: 'author1', created_at: makeDate(10) },
    ];
    const result = detectReviewCycles(basePR, reviews, events);
    expect(result).toHaveLength(1);
    expect(result[0].commitsInCycle).toBe(3);
  });
});
