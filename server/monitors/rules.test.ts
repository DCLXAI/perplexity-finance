import { describe, expect, it } from 'vitest';
import { defaultIntervalHours, parseMonitorRuleSpec } from './rules.js';

describe('parseMonitorRuleSpec', () => {
  it('accepts a price_below thesis rule', () => {
    const spec = parseMonitorRuleSpec('thesis_invalidation', {
      condition: 'price_below',
      symbol: 'AAPL',
      value: 180,
    });
    expect(spec).toEqual({ condition: 'price_below', symbol: 'AAPL', value: 180 });
  });

  it('rejects a non-positive price threshold', () => {
    expect(() => parseMonitorRuleSpec('thesis_invalidation', {
      condition: 'price_below',
      symbol: 'AAPL',
      value: 0,
    })).toThrow();
  });

  it('uppercases and bounds the symbol', () => {
    expect(() => parseMonitorRuleSpec('thesis_invalidation', {
      condition: 'price_below',
      symbol: 'aapl',
      value: 180,
    })).toThrow();
  });

  it('accepts a risk threshold rule', () => {
    const spec = parseMonitorRuleSpec('risk_threshold', {
      metric: 'annualizedVolatilityPct',
      comparison: 'above',
      value: 35,
    });
    expect(spec).toEqual({ metric: 'annualizedVolatilityPct', comparison: 'above', value: 35 });
  });

  it('rejects an unknown risk metric', () => {
    expect(() => parseMonitorRuleSpec('risk_threshold', {
      metric: 'sharpeRatio',
      comparison: 'above',
      value: 1,
    })).toThrow();
  });

  it('accepts a stress scenario rule with shocks', () => {
    const spec = parseMonitorRuleSpec('stress_scenario', {
      shocks: [{ targetType: 'all', target: '*', changePct: -20 }],
      maxProjectedLossPct: 25,
    });
    expect(spec).toMatchObject({ maxProjectedLossPct: 25 });
  });

  it('rejects a stress rule with no shocks', () => {
    expect(() => parseMonitorRuleSpec('stress_scenario', {
      shocks: [],
      maxProjectedLossPct: 25,
    })).toThrow();
  });

  it('rejects a spec whose kind does not match its shape', () => {
    expect(() => parseMonitorRuleSpec('risk_threshold', {
      condition: 'price_below',
      symbol: 'AAPL',
      value: 180,
    })).toThrow();
  });

  it('rejects unknown keys on a thesis spec', () => {
    expect(() => parseMonitorRuleSpec('thesis_invalidation', {
      condition: 'price_below',
      symbol: 'AAPL',
      value: 180,
      extra: 'x',
    })).toThrow();
  });

  it('rejects unknown keys on a risk threshold spec', () => {
    expect(() => parseMonitorRuleSpec('risk_threshold', {
      metric: 'annualizedVolatilityPct',
      comparison: 'above',
      value: 35,
      extra: 'x',
    })).toThrow();
  });

  it('rejects unknown keys on a stress scenario spec', () => {
    expect(() => parseMonitorRuleSpec('stress_scenario', {
      shocks: [{ targetType: 'all', target: '*', changePct: -20 }],
      maxProjectedLossPct: 25,
      extra: 'x',
    })).toThrow();
  });
});

describe('defaultIntervalHours', () => {
  it('defaults thesis and risk rules to daily', () => {
    expect(defaultIntervalHours('thesis_invalidation')).toBe(24);
    expect(defaultIntervalHours('risk_threshold')).toBe(24);
  });

  it('defaults stress rules to weekly', () => {
    expect(defaultIntervalHours('stress_scenario')).toBe(168);
  });
});
