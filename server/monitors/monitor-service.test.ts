import { describe, expect, it } from 'vitest';
import { groupRulesByPortfolio, nextEvaluationAt } from './monitor-service.js';

describe('groupRulesByPortfolio', () => {
  it('groups claimed rules so one observation serves every rule in a portfolio', () => {
    const groups = groupRulesByPortfolio([
      { id: 'a', portfolio_id: 'p1', user_id: 'u1' },
      { id: 'b', portfolio_id: 'p2', user_id: 'u1' },
      { id: 'c', portfolio_id: 'p1', user_id: 'u1' },
    ] as never);
    expect(groups).toHaveLength(2);
    expect(groups[0].rules.map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('nextEvaluationAt', () => {
  const now = Date.parse('2026-08-05T00:00:00.000Z');

  it('waits the full interval after a decided outcome', () => {
    expect(nextEvaluationAt('breached', 24, now)).toBe('2026-08-06T00:00:00.000Z');
    expect(nextEvaluationAt('clear', 168, now)).toBe('2026-08-12T00:00:00.000Z');
  });

  it('retries on the next run after a deferral, ignoring the interval', () => {
    // A rule that could not be evaluated has not consumed its interval; making a weekly
    // stress rule wait another 168h would turn a transient provider fault into a week blind.
    expect(nextEvaluationAt('deferred', 168, now)).toBe('2026-08-05T00:00:00.000Z');
    expect(nextEvaluationAt('error', 24, now)).toBe('2026-08-05T00:00:00.000Z');
  });
});
