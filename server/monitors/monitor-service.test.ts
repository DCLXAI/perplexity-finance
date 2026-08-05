import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorObservation } from './evaluate.js';
import type { MonitorRuleRow } from './store.js';
import type { PortfolioSummary } from '../../src/shared/api.js';

// No database is needed for `monitorRules`: `./store.js` and `./observations.js` are mocked so
// the orchestration logic (grouping, isolation, counters) can be exercised on its own. `vi.fn()`
// references are created via `vi.hoisted` because `vi.mock` factories run before the rest of the
// module body.
const {
  claimDueMonitorRulesMock,
  recordMonitorEvaluationMock,
  openMonitorDigestMock,
  appendMonitorBreachMock,
  enqueueMonitorDigestDeliveriesMock,
  buildMonitorObservationMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  claimDueMonitorRulesMock: vi.fn(),
  recordMonitorEvaluationMock: vi.fn(),
  openMonitorDigestMock: vi.fn(),
  appendMonitorBreachMock: vi.fn(),
  enqueueMonitorDigestDeliveriesMock: vi.fn(),
  buildMonitorObservationMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('./store.js', () => ({
  claimDueMonitorRules: claimDueMonitorRulesMock,
  recordMonitorEvaluation: recordMonitorEvaluationMock,
  openMonitorDigest: openMonitorDigestMock,
  appendMonitorBreach: appendMonitorBreachMock,
  enqueueMonitorDigestDeliveries: enqueueMonitorDigestDeliveriesMock,
}));

vi.mock('./observations.js', () => ({
  buildMonitorObservation: buildMonitorObservationMock,
}));

// Mocked so the digest-enqueue-isolation test can assert on warn calls without console noise
// from the real logger.
vi.mock('../observability/logger.js', () => ({
  logger: { warn: loggerWarnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn(), configure: vi.fn() },
}));

import { groupRulesByPortfolio, monitorRules, nextEvaluationAt } from './monitor-service.js';

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

describe('monitorRules — failure isolation', () => {
  const FAR_DEADLINE = Date.now() + 60_000;

  beforeEach(() => {
    vi.clearAllMocks();
    openMonitorDigestMock.mockImplementation((userId: string) => Promise.resolve({ id: `digest-${userId}` }));
    appendMonitorBreachMock.mockResolvedValue('breach-id');
    recordMonitorEvaluationMock.mockResolvedValue(undefined);
    enqueueMonitorDigestDeliveriesMock.mockResolvedValue(1);
  });

  function rule(overrides: Partial<MonitorRuleRow> = {}): MonitorRuleRow {
    return {
      id: 'r1',
      user_id: 'u1',
      portfolio_id: 'p1',
      thesis_id: null,
      symbol: null,
      kind: 'risk_threshold',
      // annualizedVolatilityPct is fixed at 20 in `observation()` below; a threshold of 10
      // breaches, a threshold of 100 stays clear — used to control per-rule outcome deterministically.
      spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 10 },
      enabled: true,
      state: 'armed',
      last_outcome: null,
      last_evaluated_at: null,
      last_observation: {},
      last_error: null,
      latched_at: null,
      min_interval_hours: 24,
      next_evaluation_at: '2026-08-05T00:00:00.000Z',
      evaluation_lease_until: null,
      rule_version: 1,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      ...overrides,
    } as MonitorRuleRow;
  }

  function observation(portfolioId: string): MonitorObservation {
    return {
      portfolioId,
      asOfISO: '2026-08-05T00:00:00.000Z',
      valuationQuality: 'verified',
      holdings: [],
      risk: {
        status: 'available',
        dataQuality: 'verified',
        observations: 60,
        annualizedVolatilityPct: 20,
        concentrationHhi: 0.3,
        effectiveHoldings: 3,
        topHoldingPct: 50,
        pricedCoveragePct: 100,
        warnings: [],
      },
      summary: {} as unknown as PortfolioSummary,
    } as MonitorObservation;
  }

  it('lets the next rule in the same group be evaluated after a rule throws', async () => {
    // Rule 'a' breaches, and every write for 'a' fails — including the fallback error-recording
    // write inside `recordError` — simulating the same transient RPC fault hitting both the
    // primary attempt and its own recovery path. Rule 'b' stays clear and must still be recorded.
    claimDueMonitorRulesMock.mockResolvedValue([
      rule({ id: 'a' }),
      rule({ id: 'b', spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 100 } }),
    ]);
    buildMonitorObservationMock.mockResolvedValue(observation('p1'));
    recordMonitorEvaluationMock.mockImplementation((input: { ruleId: string }) => (
      input.ruleId === 'a' ? Promise.reject(new Error('rpc down')) : Promise.resolve(undefined)
    ));

    const result = await monitorRules('req-1', FAR_DEADLINE);

    const ruleBCalls = recordMonitorEvaluationMock.mock.calls.filter(([input]) => input.ruleId === 'b');
    expect(ruleBCalls).toHaveLength(1);
    expect(ruleBCalls[0][0]).toMatchObject({ ruleId: 'b', outcome: 'clear' });
    expect(result.claimed).toBe(2);
    expect(result.errored).toBe(1);
    expect(result.evaluated).toBe(2);
  });

  it('lets the next group be processed after a group observation build throws', async () => {
    claimDueMonitorRulesMock.mockResolvedValue([
      rule({ id: 'a', portfolio_id: 'p1' }),
      rule({
        id: 'b',
        portfolio_id: 'p2',
        spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 100 },
      }),
    ]);
    buildMonitorObservationMock.mockImplementation((_userId: string, portfolioId: string) => (
      portfolioId === 'p1' ? Promise.reject(new Error('quotes unavailable')) : Promise.resolve(observation('p2'))
    ));

    const result = await monitorRules('req-2', FAR_DEADLINE);

    expect(buildMonitorObservationMock).toHaveBeenCalledTimes(2);
    const ruleACalls = recordMonitorEvaluationMock.mock.calls.filter(([input]) => input.ruleId === 'a');
    const ruleBCalls = recordMonitorEvaluationMock.mock.calls.filter(([input]) => input.ruleId === 'b');
    expect(ruleACalls[0][0]).toMatchObject({ ruleId: 'a', outcome: 'error' });
    expect(ruleBCalls[0][0]).toMatchObject({ ruleId: 'b', outcome: 'clear' });
    expect(result.portfolios).toBe(2);
    expect(result.errored).toBe(1);
  });

  it('still attempts a second user\'s digest after the first user\'s digest enqueue throws', async () => {
    // Both rules breach (armed -> latched), so both users end up with an opened digest. The
    // enqueue RPC itself fails for both (e.g. a transient store fault) — the run must still
    // finish, and both users' enqueue attempts must be independently logged.
    claimDueMonitorRulesMock.mockResolvedValue([
      rule({ id: 'a', portfolio_id: 'p1', user_id: 'u1' }),
      rule({ id: 'b', portfolio_id: 'p2', user_id: 'u2' }),
    ]);
    buildMonitorObservationMock.mockImplementation((_userId: string, portfolioId: string) => Promise.resolve(observation(portfolioId)));
    enqueueMonitorDigestDeliveriesMock.mockRejectedValue(new Error('digest queue down'));

    const result = await monitorRules('req-3', FAR_DEADLINE);

    expect(result.digests).toBe(2);
    const enqueueFailures = loggerWarnMock.mock.calls.filter(([event]) => event === 'monitor.digest_enqueue_failed');
    const failedUserIds = enqueueFailures.map(([, data]) => (data as { userId: string }).userId).sort();
    expect(failedUserIds).toEqual(['u1', 'u2']);
  });

  it('skips enqueueing a digest that ended up with zero breaches', async () => {
    // `openMonitorDigest` reserves the digest id before `appendMonitorBreach` durably records
    // anything against it. If that append then fails — and nothing else breaches for this user
    // in the same run — the digest must not be enqueued: handing `buildDigestPayload` an empty
    // breach list would produce a "0 conditions were met" notification, which is worse than no
    // notification at all.
    claimDueMonitorRulesMock.mockResolvedValue([rule({ id: 'a', portfolio_id: 'p1', user_id: 'u1' })]);
    buildMonitorObservationMock.mockResolvedValue(observation('p1'));
    appendMonitorBreachMock.mockRejectedValue(new Error('breach insert failed'));

    const result = await monitorRules('req-4', FAR_DEADLINE);

    expect(enqueueMonitorDigestDeliveriesMock).not.toHaveBeenCalled();
    expect(result.digests).toBe(1);
    const emptyDigestWarnings = loggerWarnMock.mock.calls.filter(([event]) => event === 'monitor.digest_empty_skipped');
    expect(emptyDigestWarnings).toHaveLength(1);
    expect(emptyDigestWarnings[0][1]).toMatchObject({ userId: 'u1' });
  });
});
