import { describe, expect, it } from 'vitest';
import { evaluateRule, nextState, shouldNotify, type MonitorObservation, type MonitorRuleInput } from './evaluate.js';
import type { PortfolioHolding, PortfolioRiskMetrics, PortfolioSummary } from '../../src/shared/api.js';

function holding(overrides: Partial<PortfolioHolding> = {}): PortfolioHolding {
  return {
    symbol: 'AAPL', quantity: 10, costBasis: 2_000, averageCost: 200,
    realizedPnl: 0, income: 0, feesPaid: 0,
    name: 'Apple', assetKind: 'stock', price: 190, marketValue: 1_900,
    allocationPct: 50, valuationQuality: 'verified',
    ...overrides,
  } as PortfolioHolding;
}

function risk(overrides: Partial<PortfolioRiskMetrics> = {}): PortfolioRiskMetrics {
  return {
    status: 'available', dataQuality: 'verified', observations: 60,
    annualizedVolatilityPct: 22, historicalVar95Pct: 3, historicalCvar95Pct: 4.5,
    maxDrawdownPct: 12, concentrationHhi: 0.3, effectiveHoldings: 3.3,
    topHoldingPct: 50, pricedCoveragePct: 100, warnings: [],
    ...overrides,
  };
}

function observation(overrides: Partial<MonitorObservation> = {}): MonitorObservation {
  const holdings = overrides.holdings ?? [holding()];
  return {
    portfolioId: 'p1',
    asOfISO: '2026-08-05T00:00:00.000Z',
    valuationQuality: 'verified',
    holdings,
    risk: risk(),
    summary: { holdings, totalValue: 3_800, marketValue: 3_800, cashBalance: 0 } as unknown as PortfolioSummary,
    ...overrides,
  };
}

function rule(overrides: Partial<MonitorRuleInput> = {}): MonitorRuleInput {
  return {
    id: 'r1', kind: 'thesis_invalidation',
    spec: { condition: 'price_below', symbol: 'AAPL', value: 195 },
    state: 'armed', ruleVersion: 1,
    ...overrides,
  } as MonitorRuleInput;
}

describe('evaluateRule — quality gate', () => {
  it('judges a verified holding even when an unrelated holding is stale', () => {
    // One stale position makes portfolio quality 'mixed'. Gating thesis rules on the
    // portfolio aggregate would blind every rule in the portfolio over an unrelated symbol.
    const result = evaluateRule(rule(), observation({
      valuationQuality: 'mixed',
      holdings: [holding(), holding({ symbol: 'TSLA', valuationQuality: 'estimated' })],
    }));
    expect(result.outcome).toBe('breached');
  });

  it('defers a stress rule when portfolio valuation is not verified', () => {
    const result = evaluateRule(
      rule({
        kind: 'stress_scenario',
        spec: { shocks: [{ targetType: 'all', target: '*', changePct: -30 }], maxProjectedLossPct: 20 },
      }),
      observation({ valuationQuality: 'estimated' }),
    );
    expect(result.outcome).toBe('deferred');
    expect(result.reason).toContain('verified');
  });

  it('defers when the watched holding is not verified even if the portfolio is', () => {
    const result = evaluateRule(
      rule(),
      observation({ holdings: [holding({ valuationQuality: 'estimated' })] }),
    );
    expect(result.outcome).toBe('deferred');
  });

  it('defers when the watched symbol is not held', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'price_below', symbol: 'MSFT', value: 400 } }),
      observation(),
    );
    expect(result.outcome).toBe('deferred');
  });
});

describe('evaluateRule — thesis invalidation', () => {
  it('breaches when price is strictly below the threshold', () => {
    const result = evaluateRule(rule(), observation());
    expect(result).toMatchObject({ outcome: 'breached', observedValue: 190, threshold: 195 });
  });

  it('is clear when price equals the threshold', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'price_below', symbol: 'AAPL', value: 190 } }),
      observation(),
    );
    expect(result.outcome).toBe('clear');
  });

  it('breaches on price_above', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'price_above', symbol: 'AAPL', value: 185 } }),
      observation(),
    );
    expect(result).toMatchObject({ outcome: 'breached', observedValue: 190 });
  });

  it('breaches when drawdown from average cost exceeds the threshold', () => {
    // averageCost 200, price 190 => 5% drawdown
    const result = evaluateRule(
      rule({ spec: { condition: 'drawdown_from_entry_pct', symbol: 'AAPL', value: 4 } }),
      observation(),
    );
    expect(result.outcome).toBe('breached');
    expect(result.observedValue).toBeCloseTo(5, 6);
  });

  it('is clear when price is above average cost', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'drawdown_from_entry_pct', symbol: 'AAPL', value: 4 } }),
      observation({ holdings: [holding({ price: 210, marketValue: 2_100 })] }),
    );
    expect(result.outcome).toBe('clear');
    expect(result.observedValue).toBe(0);
  });

  it('breaches when allocation weight exceeds the threshold', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'weight_above_pct', symbol: 'AAPL', value: 40 } }),
      observation(),
    );
    expect(result).toMatchObject({ outcome: 'breached', observedValue: 50 });
  });

  it('breaches when the holding has gone unverified for longer than the allowed days', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'no_verified_price_days', symbol: 'AAPL', value: 3 } }),
      observation({
        holdings: [holding({ valuationQuality: 'estimated' })],
        unverifiedSinceISO: { AAPL: '2026-07-25T00:00:00.000Z' },
      }),
    );
    expect(result.outcome).toBe('breached');
  });

  it('is clear on no_verified_price_days while the holding is still verified', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'no_verified_price_days', symbol: 'AAPL', value: 3 } }),
      observation(),
    );
    expect(result).toMatchObject({ outcome: 'clear', observedValue: 0 });
  });

  it('defers rather than clearing when a holding is unverified with no known timestamp', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'no_verified_price_days', symbol: 'AAPL', value: 3 } }),
      observation({ holdings: [holding({ valuationQuality: 'estimated' })] }),
    );
    expect(result.outcome).toBe('deferred');
  });

  it('defers when the last-verified timestamp is later than the observation', () => {
    const result = evaluateRule(
      rule({ spec: { condition: 'no_verified_price_days', symbol: 'AAPL', value: 3 } }),
      observation({
        holdings: [holding({ valuationQuality: 'estimated' })],
        unverifiedSinceISO: { AAPL: '2026-09-01T00:00:00.000Z' },
      }),
    );
    expect(result.outcome).toBe('deferred');
  });
});

describe('evaluateRule — risk threshold', () => {
  it('breaches when a metric rises above the threshold', () => {
    const result = evaluateRule(
      rule({ kind: 'risk_threshold', spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 20 } }),
      observation(),
    );
    expect(result).toMatchObject({ outcome: 'breached', observedValue: 22, threshold: 20 });
  });

  it('is clear when the metric sits under an above-threshold', () => {
    const result = evaluateRule(
      rule({ kind: 'risk_threshold', spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 30 } }),
      observation(),
    );
    expect(result.outcome).toBe('clear');
  });

  it('defers when risk data quality is not verified', () => {
    const result = evaluateRule(
      rule({ kind: 'risk_threshold', spec: { metric: 'maxDrawdownPct', comparison: 'above', value: 5 } }),
      observation({ risk: risk({ dataQuality: 'synthetic' }) }),
    );
    expect(result.outcome).toBe('deferred');
  });

  it('defers when risk status is insufficient-data', () => {
    const result = evaluateRule(
      rule({ kind: 'risk_threshold', spec: { metric: 'maxDrawdownPct', comparison: 'above', value: 5 } }),
      observation({ risk: risk({ status: 'insufficient-data' }) }),
    );
    expect(result.outcome).toBe('deferred');
  });

  it('defers when the requested metric is absent', () => {
    const result = evaluateRule(
      rule({ kind: 'risk_threshold', spec: { metric: 'historicalVar95Pct', comparison: 'above', value: 1 } }),
      observation({ risk: risk({ historicalVar95Pct: undefined }) }),
    );
    expect(result.outcome).toBe('deferred');
  });
});

describe('evaluateRule — stress scenario', () => {
  it('breaches when projected loss exceeds the threshold', () => {
    const result = evaluateRule(
      rule({
        kind: 'stress_scenario',
        spec: { shocks: [{ targetType: 'all', target: '*', changePct: -30 }], maxProjectedLossPct: 20 },
      }),
      observation(),
    );
    expect(result.outcome).toBe('breached');
    expect(result.observedValue).toBeCloseTo(30, 6);
  });

  it('is clear when projected loss stays within the threshold', () => {
    const result = evaluateRule(
      rule({
        kind: 'stress_scenario',
        spec: { shocks: [{ targetType: 'all', target: '*', changePct: -10 }], maxProjectedLossPct: 20 },
      }),
      observation(),
    );
    expect(result.outcome).toBe('clear');
  });

  it('defers rather than clearing when the projected loss cannot be computed', () => {
    const result = evaluateRule(
      rule({
        kind: 'stress_scenario',
        spec: { shocks: [{ targetType: 'all', target: '*', changePct: -30 }], maxProjectedLossPct: 20 },
      }),
      // summary without cashBalance: runPortfolioScenario yields NaN
      observation({ summary: { holdings: [holding()], totalValue: 3_800, marketValue: 3_800 } as unknown as PortfolioSummary }),
    );
    expect(result.outcome).toBe('deferred');
  });
});

describe('latch transitions', () => {
  it('latches on breach and notifies', () => {
    expect(nextState('armed', 'breached')).toBe('latched');
    expect(shouldNotify('armed', 'breached')).toBe(true);
  });

  it('does not notify twice while latched', () => {
    expect(nextState('latched', 'breached')).toBe('latched');
    expect(shouldNotify('latched', 'breached')).toBe(false);
  });

  it('re-arms when the predicate goes false', () => {
    expect(nextState('latched', 'clear')).toBe('armed');
    expect(shouldNotify('latched', 'clear')).toBe(false);
  });

  it('makes no transition on deferral in either direction', () => {
    expect(nextState('armed', 'deferred')).toBe('armed');
    expect(nextState('latched', 'deferred')).toBe('latched');
    expect(shouldNotify('armed', 'deferred')).toBe(false);
    expect(shouldNotify('latched', 'deferred')).toBe(false);
  });
});
