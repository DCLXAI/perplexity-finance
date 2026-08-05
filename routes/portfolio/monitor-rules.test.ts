import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorRuleRow } from '../../server/monitors/store.js';

// Fix-round regression tests for the three review findings on monitor-rules.ts:
//   (a) I3/M1 -- a thesis_invalidation POST that omits the top-level `symbol` (natural, since
//       the symbol already lives inside `spec`) must succeed, not violate the table's
//       `(kind = 'thesis_invalidation') = (symbol is not null)` check constraint.
//   (b) I2 -- a spec Zod accepts but validate_monitor_rule_spec rejects (drawdown value: 0,
//       which Zod's percentSchema (min(0)) allows but the RPC requires positive) must map to a
//       400, not fall through mapMonitorStoreError to a raw 500.
//   (c)/(d) I3/M1 -- a kind/symbol mismatch (a non-thesis kind supplied with a symbol, or a
//       thesis rule whose top-level symbol disagrees with spec.symbol) must be rejected with
//       400 before ever reaching the store.
//
// The store layer is mocked; parseMonitorRuleSpec/defaultIntervalHours run for real so the
// route's actual Zod validation and symbol-resolution logic are exercised. `vi.fn()` references
// are created via `vi.hoisted` because `vi.mock` factories run before the rest of the module
// body (see server/monitors/monitor-service.test.ts for the same pattern).

const { upsertMonitorRule, listMonitorRules, deleteMonitorRule } = vi.hoisted(() => ({
  upsertMonitorRule: vi.fn(),
  listMonitorRules: vi.fn(),
  deleteMonitorRule: vi.fn(),
}));

vi.mock('../../server/auth/supabase.js', () => ({
  requireUser: async () => ({ id: 'user-1' }),
}));
vi.mock('../../server/rate-limit.js', () => ({
  enforceRateLimit: async () => {},
}));
vi.mock('../../server/monitors/store.js', () => ({
  upsertMonitorRule,
  listMonitorRules,
  deleteMonitorRule,
}));

import handler from './monitor-rules.js';

const PORTFOLIO_ID = '11111111-1111-4111-8111-111111111111';

function fakeRow(overrides: Partial<MonitorRuleRow> = {}): MonitorRuleRow {
  const now = new Date().toISOString();
  return {
    id: 'rule-1',
    user_id: 'user-1',
    portfolio_id: PORTFOLIO_ID,
    thesis_id: null,
    symbol: null,
    kind: 'thesis_invalidation',
    spec: {},
    enabled: true,
    state: 'armed',
    last_outcome: null,
    last_evaluated_at: null,
    last_observation: {},
    last_error: null,
    latched_at: null,
    min_interval_hours: 24,
    next_evaluation_at: now,
    evaluation_lease_until: null,
    rule_version: 1,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function postRequest(body: unknown): Request {
  return new Request('https://example.com/api/portfolio/monitor-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/portfolio/monitor-rules', () => {
  beforeEach(() => {
    upsertMonitorRule.mockReset();
    listMonitorRules.mockReset();
    deleteMonitorRule.mockReset();
  });

  it('accepts a thesis_invalidation POST that omits the top-level symbol', async () => {
    upsertMonitorRule.mockImplementation(async (input: { symbol: string | null; kind: string; spec: unknown }) =>
      fakeRow({ symbol: input.symbol, kind: input.kind as MonitorRuleRow['kind'], spec: input.spec as Record<string, unknown> }));

    const response = await handler(postRequest({
      portfolioId: PORTFOLIO_ID,
      kind: 'thesis_invalidation',
      spec: { condition: 'price_below', symbol: 'AAPL', value: 100 },
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.rule.symbol).toBe('AAPL');
    expect(upsertMonitorRule).toHaveBeenCalledTimes(1);
    expect((upsertMonitorRule.mock.calls[0]?.[0] as { symbol: string | null }).symbol).toBe('AAPL');
  });

  it('maps a spec Zod accepts but the DB rejects (drawdown value: 0) to 400, not 500', async () => {
    upsertMonitorRule.mockRejectedValue(new Error('monitor_rules.upsert: thesis threshold must be positive'));

    const response = await handler(postRequest({
      portfolioId: PORTFOLIO_ID,
      kind: 'thesis_invalidation',
      spec: { condition: 'drawdown_from_entry_pct', symbol: 'AAPL', value: 0 },
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('MONITOR_RULE_SPEC_INVALID');
  });

  it('rejects a risk_threshold POST that supplies a top-level symbol (kind/symbol mismatch) with 400', async () => {
    const response = await handler(postRequest({
      portfolioId: PORTFOLIO_ID,
      kind: 'risk_threshold',
      symbol: 'AAPL',
      spec: { metric: 'maxDrawdownPct', comparison: 'above', value: 10 },
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('MONITOR_RULE_SYMBOL_NOT_ALLOWED');
    expect(upsertMonitorRule).not.toHaveBeenCalled();
  });

  it('rejects a thesis_invalidation POST whose top-level symbol disagrees with spec.symbol with 400', async () => {
    const response = await handler(postRequest({
      portfolioId: PORTFOLIO_ID,
      kind: 'thesis_invalidation',
      symbol: 'TSLA',
      spec: { condition: 'price_below', symbol: 'AAPL', value: 100 },
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('MONITOR_RULE_SYMBOL_MISMATCH');
    expect(upsertMonitorRule).not.toHaveBeenCalled();
  });

  it('does not require an Idempotency-Key header', async () => {
    upsertMonitorRule.mockResolvedValue(fakeRow({
      symbol: 'AAPL',
      spec: { condition: 'price_below', symbol: 'AAPL', value: 100 },
    }));

    const response = await handler(postRequest({
      portfolioId: PORTFOLIO_ID,
      kind: 'thesis_invalidation',
      spec: { condition: 'price_below', symbol: 'AAPL', value: 100 },
    }));

    expect(response.status).toBe(201);
  });
});
