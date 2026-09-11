const { classifyAging } = require('../aging');

describe('Aging Engine', () => {
  function makePR(hoursOld, overrides = {}) {
    const created = new Date();
    created.setHours(created.getHours() - hoursOld);
    return {
      state: 'open',
      is_draft: false,
      created_at: created.toISOString(),
      review_cycles_count: 0,
      ...overrides,
    };
  }

  function makeResponsibility(waitingHours = 0) {
    return {
      state: 'WAITING_FOR_REVIEW',
      waitingDuration: waitingHours,
      startedAt: new Date().toISOString(),
    };
  }

  it('should classify healthy PR (4 hours old)', () => {
    const result = classifyAging(makePR(4), makeResponsibility(4));
    expect(result.status).toBe('healthy');
  });

  it('should classify attention PR (30 hours old)', () => {
    const result = classifyAging(makePR(30), makeResponsibility(10));
    expect(result.status).toBe('attention');
  });

  it('should classify aging PR (4 days old)', () => {
    const result = classifyAging(makePR(96), makeResponsibility(20));
    expect(result.status).toBe('aging');
  });

  it('should classify critical PR (8 days old)', () => {
    const result = classifyAging(makePR(192), makeResponsibility(50));
    expect(result.status).toBe('critical');
  });

  it('should classify critical by wait time (80+ hours waiting)', () => {
    const result = classifyAging(makePR(48), makeResponsibility(80));
    expect(result.status).toBe('critical');
  });

  it('should classify critical by review cycles (5+)', () => {
    const result = classifyAging(makePR(12), makeResponsibility(5), );
    const pr = makePR(12, { review_cycles_count: 5 });
    const result2 = classifyAging(pr, makeResponsibility(5));
    expect(result2.status).toBe('critical');
  });

  it('should keep draft PR healthy when young', () => {
    const pr = makePR(48, { is_draft: true });
    const result = classifyAging(pr, makeResponsibility(24));
    expect(result.status).toBe('healthy');
  });

  it('should cap draft PR at attention even when old', () => {
    const pr = makePR(240, { is_draft: true });
    const result = classifyAging(pr, makeResponsibility(100));
    expect(result.status).toBe('attention');
  });

  it('should return closed for closed PR', () => {
    const pr = makePR(48, { state: 'closed' });
    const result = classifyAging(pr, makeResponsibility(0));
    expect(result.status).toBe('closed');
  });
});
