# P10 Rule-Based Portfolio Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watch investment-thesis invalidation conditions, portfolio risk thresholds, and stress-scenario losses on a daily schedule, and notify the owner once per run when a rule transitions into breach.

**Architecture:** One `monitor_rules` table holds a discriminated union of three rule kinds. A single evaluator loads one shared observation per portfolio — `buildPortfolioSummary`, the same call the snapshot Cron makes — and all three kinds read from it. Breaches latch, so a rule fires only on the transition into breach; all of a user's breaches in one run collapse into a single email or push. Evaluation appends to the existing `daily-maintenance` Cron, adding no third schedule.

**Tech Stack:** TypeScript 5.9 (ESM, `.js` import specifiers), Vitest, Zod 4, Supabase Postgres with security-definer RPCs, React 19, Vercel serverless functions.

## Global Constraints

- Node.js `>=22.22.0`. React 19, `react-router` 8 (never `react-router-dom` — the package does not exist in v8).
- All relative imports use `.js` specifiers even for `.ts` sources; `npm run validate:esm` enforces this.
- Application version moves `1.10.0` → `1.11.0` in Task 11. Until then leave every version literal alone.
- Vercel Hobby allows exactly two Cron schedules and both are taken. **Add no Cron entry to `vercel.json`.**
- Serverless functions cap at 60 seconds.
- Never fire an alert on non-`verified` input. A non-verified evaluation produces no latch transition in either direction.
- A breach notifies only. It never writes to the transaction ledger, never changes `investment_theses.status`, and never creates a plan.
- Every user-visible notification states that it is not an order suggestion and that nothing was written to the ledger.
- All new DB mutations go through security-definer RPCs. Authenticated clients get `select` on their own rows via RLS and no direct write.
- User-facing copy is Korean, matching existing surfaces.
- Run `npm run check` before every commit. It must exit 0.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/monitors/rules.ts` | Rule spec union types + Zod schemas. Pure, no IO. |
| `server/monitors/evaluate.ts` | `(rule, observation) → EvaluationOutcome`. Pure. The main test surface. |
| `server/monitors/evaluate.test.ts` | Unit tests for the evaluator. |
| `server/monitors/observations.ts` | Builds one `MonitorObservation` per portfolio from `buildPortfolioSummary`. |
| `server/monitors/store.ts` | Supabase reads and RPC calls for rules, breaches, digests, deliveries. |
| `server/monitors/monitor-service.ts` | Orchestration: claim due rules → evaluate → latch → enqueue digest. Deadline-aware. |
| `server/monitors/digest.ts` | Assembles per-user digest payload from breaches. |
| `server/notifications/delivery.ts` | Shared retry/email/push primitives, extracted from `rebalances.ts`. |
| `server/notifications/monitors.ts` | Monitor digest delivery, built on `delivery.ts`. |
| `routes/portfolio/monitor-rules.ts` | Authenticated CRUD for rules. |
| `routes/portfolio/monitor-status.ts` | Read-only rule status + breach history. |
| `src/features/portfolio/MonitorRuleEditor.tsx` | Shared rule-editing form, used by both hosts. |
| `src/features/portfolio/MonitorStatusPanel.tsx` | Per-rule state, outcome, last observation, breach history. |
| `supabase/migrations/202608050001_p10_monitor_rules.sql` | Tables, RLS, RPCs, JSON validation. |
| `scripts/validate-p10.ts` | Contract assertions, wired into `npm run check`. |

---

### Task 1: Rule spec types and validation

**Files:**
- Create: `server/monitors/rules.ts`
- Create: `server/monitors/rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MonitorRuleKind`, `MonitorRuleSpec`, `ThesisInvalidationSpec`, `RiskThresholdSpec`, `StressScenarioSpec`, `RiskMetricKey`, `monitorRuleSpecSchema`, `parseMonitorRuleSpec(kind, value)`, `defaultIntervalHours(kind)`.

- [ ] **Step 1: Write the failing test**

```ts
// server/monitors/rules.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/monitors/rules.test.ts`
Expected: FAIL — cannot resolve `./rules.js`.

- [ ] **Step 3: Write the implementation**

```ts
// server/monitors/rules.ts
import { z } from 'zod';

export type MonitorRuleKind = 'thesis_invalidation' | 'risk_threshold' | 'stress_scenario';

/** Keys of PortfolioRiskMetrics that carry a comparable number. */
export type RiskMetricKey =
  | 'annualizedVolatilityPct'
  | 'historicalVar95Pct'
  | 'historicalCvar95Pct'
  | 'maxDrawdownPct'
  | 'concentrationHhi'
  | 'topHoldingPct';

const RISK_METRIC_KEYS = [
  'annualizedVolatilityPct',
  'historicalVar95Pct',
  'historicalCvar95Pct',
  'maxDrawdownPct',
  'concentrationHhi',
  'topHoldingPct',
] as const;

const symbolSchema = z
  .string()
  .min(1)
  .max(20)
  .refine((value) => value === value.toUpperCase(), { message: 'symbol must be uppercase' });

const percentSchema = z.number().finite().min(0).max(1_000);

const thesisInvalidationSchema = z.discriminatedUnion('condition', [
  z.object({ condition: z.literal('price_below'), symbol: symbolSchema, value: z.number().finite().positive() }),
  z.object({ condition: z.literal('price_above'), symbol: symbolSchema, value: z.number().finite().positive() }),
  z.object({ condition: z.literal('drawdown_from_entry_pct'), symbol: symbolSchema, value: percentSchema }),
  z.object({ condition: z.literal('weight_above_pct'), symbol: symbolSchema, value: percentSchema }),
  z.object({
    condition: z.literal('no_verified_price_days'),
    symbol: symbolSchema,
    value: z.number().int().min(1).max(365),
  }),
]);

const riskThresholdSchema = z.object({
  metric: z.enum(RISK_METRIC_KEYS),
  comparison: z.enum(['above', 'below']),
  value: z.number().finite().min(-1_000).max(1_000),
});

const stressScenarioSchema = z.object({
  shocks: z
    .array(z.object({
      targetType: z.enum(['all', 'symbol', 'sector', 'asset-kind']),
      target: z.string().min(1).max(40),
      changePct: z.number().finite().min(-100).max(1_000),
    }))
    .min(1)
    .max(20),
  maxProjectedLossPct: percentSchema,
});

export type ThesisInvalidationSpec = z.infer<typeof thesisInvalidationSchema>;
export type RiskThresholdSpec = z.infer<typeof riskThresholdSchema>;
export type StressScenarioSpec = z.infer<typeof stressScenarioSchema>;
export type MonitorRuleSpec = ThesisInvalidationSpec | RiskThresholdSpec | StressScenarioSpec;

export const monitorRuleSpecSchema = {
  thesis_invalidation: thesisInvalidationSchema,
  risk_threshold: riskThresholdSchema,
  stress_scenario: stressScenarioSchema,
} as const;

/**
 * Parses a stored or user-supplied spec against its kind. Throws on mismatch, so a
 * malformed row can never reach the evaluator and be silently treated as "not breached".
 */
export function parseMonitorRuleSpec(kind: MonitorRuleKind, value: unknown): MonitorRuleSpec {
  return monitorRuleSpecSchema[kind].strict().parse(value);
}

export function defaultIntervalHours(kind: MonitorRuleKind): number {
  return kind === 'stress_scenario' ? 168 : 24;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/monitors/rules.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/monitors/rules.ts server/monitors/rules.test.ts
git commit -m "feat(p10): add monitor rule spec types and validation"
```

---

### Task 2: Pure evaluator

This is the task that decides whether P10 is trustworthy. Every outcome that is *not* a breach must be distinguishable, because "why didn't it fire?" is answered from these values.

**Files:**
- Create: `server/monitors/evaluate.ts`
- Create: `server/monitors/evaluate.test.ts`

**Interfaces:**
- Consumes: `MonitorRuleKind`, `MonitorRuleSpec`, `parseMonitorRuleSpec` from Task 1.
- Produces:
  - `MonitorObservation` — `{ portfolioId, asOfISO, valuationQuality, holdings, risk, summary }` where `holdings: readonly PortfolioHolding[]`, `risk: PortfolioRiskMetrics`, `summary: PortfolioSummary`.
  - `MonitorRuleInput` — `{ id, kind, spec, state, ruleVersion }` with `state: 'armed' | 'latched'`.
  - `EvaluationOutcome` — `{ outcome: 'breached' | 'clear' | 'deferred'; observedValue?: number; threshold?: number; reason?: string }`.
  - `evaluateRule(rule: MonitorRuleInput, observation: MonitorObservation): EvaluationOutcome`.
  - `nextState(current, outcome)` → `'armed' | 'latched'`.
  - `shouldNotify(current, outcome)` → `boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// server/monitors/evaluate.test.ts
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
    summary: { holdings, totalValue: 3_800, marketValue: 3_800 } as unknown as PortfolioSummary,
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
  it('defers when portfolio valuation is not verified', () => {
    const result = evaluateRule(rule(), observation({ valuationQuality: 'estimated' }));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/monitors/evaluate.test.ts`
Expected: FAIL — cannot resolve `./evaluate.js`.

- [ ] **Step 3: Write the implementation**

```ts
// server/monitors/evaluate.ts
import { runPortfolioScenario } from '../../src/domain/portfolio/scenario.js';
import type {
  PortfolioHolding,
  PortfolioRiskMetrics,
  PortfolioSummary,
  PortfolioValuationQuality,
} from '../../src/shared/api.js';
import {
  parseMonitorRuleSpec,
  type MonitorRuleKind,
  type MonitorRuleSpec,
  type RiskThresholdSpec,
  type StressScenarioSpec,
  type ThesisInvalidationSpec,
} from './rules.js';

export type MonitorLatchState = 'armed' | 'latched';
export type MonitorOutcome = 'breached' | 'clear' | 'deferred';

export interface MonitorObservation {
  readonly portfolioId: string;
  readonly asOfISO: string;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly holdings: readonly PortfolioHolding[];
  readonly risk: PortfolioRiskMetrics;
  readonly summary: PortfolioSummary;
  /** Symbol -> ISO timestamp of the last verified price, when it is currently unverified. */
  readonly unverifiedSinceISO?: Readonly<Record<string, string>>;
}

export interface MonitorRuleInput {
  readonly id: string;
  readonly kind: MonitorRuleKind;
  readonly spec: MonitorRuleSpec;
  readonly state: MonitorLatchState;
  readonly ruleVersion: number;
}

export interface EvaluationOutcome {
  readonly outcome: MonitorOutcome;
  readonly observedValue?: number;
  readonly threshold?: number;
  readonly reason?: string;
}

function deferred(reason: string): EvaluationOutcome {
  return Object.freeze({ outcome: 'deferred' as const, reason });
}

function decide(breached: boolean, observedValue: number, threshold: number): EvaluationOutcome {
  return Object.freeze({
    outcome: breached ? ('breached' as const) : ('clear' as const),
    observedValue,
    threshold,
  });
}

function evaluateThesis(
  spec: ThesisInvalidationSpec,
  observation: MonitorObservation,
): EvaluationOutcome {
  const held = observation.holdings.find((candidate) => candidate.symbol === spec.symbol);
  if (!held) return deferred(`${spec.symbol}을 보유하고 있지 않아 판정을 건너뜁니다.`);

  // no_verified_price_days is the one condition that is *about* missing verification, so it
  // reads the unverified clock instead of requiring a verified holding.
  if (spec.condition === 'no_verified_price_days') {
    if (held.valuationQuality === 'verified') return decide(false, 0, spec.value);
    const since = observation.unverifiedSinceISO?.[spec.symbol];
    // Unverified with no provider timestamp: we cannot say how long it has been stale.
    // Returning `clear` here would silence the one rule that exists to catch this.
    if (!since) return deferred(`${spec.symbol}의 마지막 검증 시각을 알 수 없습니다.`);
    const days = (Date.parse(observation.asOfISO) - Date.parse(since)) / 86_400_000;
    if (!Number.isFinite(days)) return deferred('마지막 검증 시각을 읽을 수 없습니다.');
    return decide(days > spec.value, Math.max(0, days), spec.value);
  }

  if (held.valuationQuality !== 'verified') {
    return deferred(`${spec.symbol}의 시세가 verified가 아니라 판정하지 않습니다.`);
  }
  const price = held.price;
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return deferred(`${spec.symbol}의 사용 가능한 시세가 없습니다.`);
  }

  switch (spec.condition) {
    case 'price_below':
      return decide(price < spec.value, price, spec.value);
    case 'price_above':
      return decide(price > spec.value, price, spec.value);
    case 'drawdown_from_entry_pct': {
      if (held.averageCost <= 0) return deferred(`${spec.symbol}의 평균단가가 없습니다.`);
      const drawdown = Math.max(0, ((held.averageCost - price) / held.averageCost) * 100);
      return decide(drawdown > spec.value, drawdown, spec.value);
    }
    case 'weight_above_pct':
      return decide(held.allocationPct > spec.value, held.allocationPct, spec.value);
  }
}

function evaluateRisk(spec: RiskThresholdSpec, observation: MonitorObservation): EvaluationOutcome {
  const { risk } = observation;
  if (risk.dataQuality !== 'verified') {
    return deferred('리스크 이력 품질이 verified가 아니라 판정하지 않습니다.');
  }
  if (risk.status !== 'available') {
    return deferred(`리스크 지표 상태가 ${risk.status}입니다.`);
  }
  const observed = risk[spec.metric];
  if (observed === undefined || !Number.isFinite(observed)) {
    return deferred(`${spec.metric} 지표가 계산되지 않았습니다.`);
  }
  const breached = spec.comparison === 'above' ? observed > spec.value : observed < spec.value;
  return decide(breached, observed, spec.value);
}

function evaluateStress(spec: StressScenarioSpec, observation: MonitorObservation): EvaluationOutcome {
  if (observation.valuationQuality !== 'verified') {
    return deferred('포트폴리오 평가 품질이 verified가 아니라 판정하지 않습니다.');
  }
  const result = runPortfolioScenario(observation.summary, spec.shocks);
  // changePct is signed; a loss is negative. Compare magnitude of the loss only.
  const lossPct = Math.max(0, -result.changePct);
  return decide(lossPct > spec.maxProjectedLossPct, lossPct, spec.maxProjectedLossPct);
}

/**
 * Evaluates one rule against one shared observation. Returns `deferred` — never a verdict —
 * whenever the inputs are not verified, so a provider wobble cannot produce an alert.
 */
export function evaluateRule(
  rule: MonitorRuleInput,
  observation: MonitorObservation,
): EvaluationOutcome {
  let spec: MonitorRuleSpec;
  try {
    spec = parseMonitorRuleSpec(rule.kind, rule.spec);
  } catch {
    return deferred('규칙 정의가 현재 스키마와 맞지 않습니다.');
  }

  if (observation.valuationQuality !== 'verified' && rule.kind !== 'thesis_invalidation') {
    return deferred('포트폴리오 평가 품질이 verified가 아니라 판정하지 않습니다.');
  }

  switch (rule.kind) {
    case 'thesis_invalidation':
      if (observation.valuationQuality !== 'verified') {
        return deferred('포트폴리오 평가 품질이 verified가 아니라 판정하지 않습니다.');
      }
      return evaluateThesis(spec as ThesisInvalidationSpec, observation);
    case 'risk_threshold':
      return evaluateRisk(spec as RiskThresholdSpec, observation);
    case 'stress_scenario':
      return evaluateStress(spec as StressScenarioSpec, observation);
  }
}

export function nextState(current: MonitorLatchState, outcome: MonitorOutcome): MonitorLatchState {
  if (outcome === 'deferred') return current;
  return outcome === 'breached' ? 'latched' : 'armed';
}

/** Fires only on the armed -> latched transition. */
export function shouldNotify(current: MonitorLatchState, outcome: MonitorOutcome): boolean {
  return current === 'armed' && outcome === 'breached';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/monitors/evaluate.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Verify the full gate still passes**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/monitors/evaluate.ts server/monitors/evaluate.test.ts
git commit -m "feat(p10): add pure monitor rule evaluator with quality gate and latch"
```

---

### Task 3: Database migration

**Files:**
- Create: `supabase/migrations/202608050001_p10_monitor_rules.sql`

**Interfaces:**
- Produces RPCs consumed by Task 4: `claim_due_monitor_rules(p_limit int)`, `record_monitor_evaluation(...)`, `open_monitor_digest(p_user_id uuid)`, `enqueue_monitor_digest_deliveries(p_digest_id uuid)`, `claim_due_monitor_digest_deliveries(p_limit int)`, `mark_monitor_digest_delivery_sent/failure/disabled(...)`, `upsert_monitor_rule(...)`, `delete_monitor_rule(...)`.

- [ ] **Step 1: Write the migration**

Follow the P7 migration's structure exactly: tables, partial indexes on due rows, `enable row level security`, select-own policies, `revoke` direct writes, then security-definer functions with `set search_path = public`.

```sql
-- supabase/migrations/202608050001_p10_monitor_rules.sql
-- P10: rule-based portfolio monitoring. Additive; no existing table is altered.

create table if not exists public.monitor_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  thesis_id uuid references public.investment_theses(id) on delete cascade,
  symbol text check (symbol is null or (symbol = upper(symbol) and char_length(symbol) between 1 and 20)),
  kind text not null check (kind in ('thesis_invalidation', 'risk_threshold', 'stress_scenario')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  enabled boolean not null default true,
  state text not null default 'armed' check (state in ('armed', 'latched')),
  last_outcome text check (last_outcome is null or last_outcome in ('breached', 'clear', 'deferred', 'error')),
  last_evaluated_at timestamptz,
  last_observation jsonb not null default '{}'::jsonb,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  latched_at timestamptz,
  min_interval_hours smallint not null default 24 check (min_interval_hours between 1 and 8760),
  next_evaluation_at timestamptz not null default timezone('utc', now()),
  rule_version integer not null default 1 check (rule_version >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- thesis rules must name a symbol; portfolio-level rules must not.
  check ((kind = 'thesis_invalidation') = (symbol is not null))
);

create index if not exists monitor_rules_due_idx
  on public.monitor_rules(next_evaluation_at, portfolio_id)
  where enabled;
create index if not exists monitor_rules_owner_idx
  on public.monitor_rules(user_id, portfolio_id, kind);

create table if not exists public.monitor_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'dispatched')),
  breach_count integer not null default 0 check (breach_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  dispatched_at timestamptz
);
create index if not exists monitor_digests_open_idx
  on public.monitor_digests(user_id) where status = 'open';

create table if not exists public.monitor_breaches (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.monitor_rules(id) on delete cascade,
  digest_id uuid references public.monitor_digests(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  rule_version integer not null,
  kind text not null,
  spec jsonb not null,
  observed_value numeric(28, 8),
  threshold_value numeric(28, 8),
  observed_at timestamptz not null,
  input_quality text not null,
  source_snapshot_id bigint references public.portfolio_snapshots(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists monitor_breaches_rule_idx
  on public.monitor_breaches(rule_id, created_at desc);

create table if not exists public.monitor_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references public.monitor_digests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'disabled')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(digest_id, channel)
);
create index if not exists monitor_digest_deliveries_due_idx
  on public.monitor_digest_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.monitor_rules enable row level security;
alter table public.monitor_digests enable row level security;
alter table public.monitor_breaches enable row level security;
alter table public.monitor_digest_deliveries enable row level security;

drop policy if exists monitor_rules_select_own on public.monitor_rules;
create policy monitor_rules_select_own on public.monitor_rules for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_digests_select_own on public.monitor_digests;
create policy monitor_digests_select_own on public.monitor_digests for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_breaches_select_own on public.monitor_breaches;
create policy monitor_breaches_select_own on public.monitor_breaches for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_digest_deliveries_select_own on public.monitor_digest_deliveries;
create policy monitor_digest_deliveries_select_own on public.monitor_digest_deliveries for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.monitor_rules from authenticated;
revoke insert, update, delete on public.monitor_digests from authenticated;
revoke insert, update, delete on public.monitor_breaches from authenticated;
revoke insert, update, delete on public.monitor_digest_deliveries from authenticated;
```

Then the security-definer functions in the same file:

```sql
-- Validates a spec against its kind. Mirrors server/monitors/rules.ts so a direct RPC call
-- cannot store a shape the evaluator would later refuse to parse.
create or replace function public.validate_monitor_rule_spec(p_kind text, p_spec jsonb)
returns void language plpgsql immutable as $$
begin
  if p_kind = 'thesis_invalidation' then
    if not (p_spec ? 'condition' and p_spec ? 'symbol' and p_spec ? 'value') then
      raise exception 'thesis_invalidation spec requires condition, symbol, value';
    end if;
    if p_spec->>'condition' not in
      ('price_below','price_above','drawdown_from_entry_pct','weight_above_pct','no_verified_price_days') then
      raise exception 'unknown thesis condition %', p_spec->>'condition';
    end if;
    if (p_spec->>'value')::numeric <= 0 then
      raise exception 'thesis threshold must be positive';
    end if;
  elsif p_kind = 'risk_threshold' then
    if p_spec->>'metric' not in
      ('annualizedVolatilityPct','historicalVar95Pct','historicalCvar95Pct',
       'maxDrawdownPct','concentrationHhi','topHoldingPct') then
      raise exception 'unknown risk metric %', p_spec->>'metric';
    end if;
    if p_spec->>'comparison' not in ('above','below') then
      raise exception 'unknown comparison %', p_spec->>'comparison';
    end if;
  elsif p_kind = 'stress_scenario' then
    if jsonb_typeof(p_spec->'shocks') <> 'array'
       or jsonb_array_length(p_spec->'shocks') between 1 and 20 is not true then
      raise exception 'stress_scenario requires 1..20 shocks';
    end if;
    if (p_spec->>'maxProjectedLossPct')::numeric < 0 then
      raise exception 'maxProjectedLossPct must be non-negative';
    end if;
  else
    raise exception 'unknown monitor rule kind %', p_kind;
  end if;
end;
$$;

-- Editing a rule increments rule_version and re-arms it, so an edited threshold cannot be
-- swallowed by a latch left over from the previous threshold.
create or replace function public.upsert_monitor_rule(
  p_user_id uuid, p_portfolio_id uuid, p_rule_id uuid, p_thesis_id uuid,
  p_symbol text, p_kind text, p_spec jsonb, p_enabled boolean, p_min_interval_hours smallint
) returns public.monitor_rules language plpgsql security definer set search_path = public as $$
declare v_row public.monitor_rules;
begin
  perform public.validate_monitor_rule_spec(p_kind, p_spec);
  if not exists (select 1 from public.portfolios where id = p_portfolio_id and user_id = p_user_id) then
    raise exception 'portfolio not found for user';
  end if;

  if p_rule_id is null then
    insert into public.monitor_rules
      (user_id, portfolio_id, thesis_id, symbol, kind, spec, enabled, min_interval_hours, next_evaluation_at)
    values
      (p_user_id, p_portfolio_id, p_thesis_id, p_symbol, p_kind, p_spec, p_enabled,
       p_min_interval_hours, timezone('utc', now()))
    returning * into v_row;
  else
    update public.monitor_rules set
      thesis_id = p_thesis_id, symbol = p_symbol, spec = p_spec, enabled = p_enabled,
      min_interval_hours = p_min_interval_hours,
      state = 'armed', latched_at = null,
      rule_version = rule_version + 1,
      next_evaluation_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = p_rule_id and user_id = p_user_id and kind = p_kind
    returning * into v_row;
    if v_row.id is null then raise exception 'monitor rule not found'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_monitor_rule(p_user_id uuid, p_rule_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.monitor_rules where id = p_rule_id and user_id = p_user_id;
end;
$$;

-- Claims due rules oldest-first so no batch can starve a later rule, and orders by
-- portfolio so the caller can group and build one observation per portfolio.
create or replace function public.claim_due_monitor_rules(p_limit integer default 200)
returns setof public.monitor_rules language sql security definer set search_path = public as $$
  select * from public.monitor_rules
  where enabled and next_evaluation_at <= timezone('utc', now())
  order by next_evaluation_at asc, portfolio_id asc
  limit greatest(1, least(p_limit, 600));
$$;

create or replace function public.record_monitor_evaluation(
  p_rule_id uuid, p_outcome text, p_state text, p_observation jsonb,
  p_error text, p_next_evaluation_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.monitor_rules set
    last_outcome = p_outcome,
    state = p_state,
    latched_at = case when p_state = 'latched' and state = 'armed' then timezone('utc', now())
                      when p_state = 'armed' then null else latched_at end,
    last_observation = coalesce(p_observation, '{}'::jsonb),
    last_error = p_error,
    last_evaluated_at = timezone('utc', now()),
    next_evaluation_at = p_next_evaluation_at,
    updated_at = timezone('utc', now())
  where id = p_rule_id;
end;
$$;

create or replace function public.open_monitor_digest(p_user_id uuid)
returns public.monitor_digests language plpgsql security definer set search_path = public as $$
declare v_row public.monitor_digests;
begin
  select * into v_row from public.monitor_digests
    where user_id = p_user_id and status = 'open' limit 1;
  if v_row.id is null then
    insert into public.monitor_digests (user_id) values (p_user_id) returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.append_monitor_breach(
  p_rule_id uuid, p_digest_id uuid, p_user_id uuid, p_portfolio_id uuid, p_rule_version integer,
  p_kind text, p_spec jsonb, p_observed numeric, p_threshold numeric,
  p_observed_at timestamptz, p_input_quality text, p_snapshot_id bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.monitor_breaches
    (rule_id, digest_id, user_id, portfolio_id, rule_version, kind, spec,
     observed_value, threshold_value, observed_at, input_quality, source_snapshot_id)
  values
    (p_rule_id, p_digest_id, p_user_id, p_portfolio_id, p_rule_version, p_kind, p_spec,
     p_observed, p_threshold, p_observed_at, p_input_quality, p_snapshot_id)
  returning id into v_id;
  update public.monitor_digests set breach_count = breach_count + 1 where id = p_digest_id;
  return v_id;
end;
$$;

-- Closes the digest and fans it out to both channels in one transaction.
create or replace function public.enqueue_monitor_digest_deliveries(p_digest_id uuid, p_payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_count integer := 0;
begin
  select user_id into v_user from public.monitor_digests
    where id = p_digest_id and status = 'open' for update;
  if v_user is null then return 0; end if;

  insert into public.monitor_digest_deliveries (digest_id, user_id, channel, payload)
  select p_digest_id, v_user, channel, p_payload from unnest(array['email','push']) as channel
  on conflict (digest_id, channel) do nothing;
  get diagnostics v_count = row_count;

  update public.monitor_digests
    set status = 'dispatched', dispatched_at = timezone('utc', now())
    where id = p_digest_id;
  return v_count;
end;
$$;

create or replace function public.claim_due_monitor_digest_deliveries(p_limit integer default 50)
returns setof public.monitor_digest_deliveries language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.monitor_digest_deliveries set status = 'processing', updated_at = timezone('utc', now())
  where id in (
    select id from public.monitor_digest_deliveries
    where status in ('pending', 'retry')
      and (next_attempt_at is null or next_attempt_at <= timezone('utc', now()))
    order by created_at asc
    limit greatest(1, least(p_limit, 250))
    for update skip locked
  )
  returning *;
end;
$$;

create or replace function public.mark_monitor_digest_delivery_sent(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries
    set status = 'sent', sent_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = p_id;
$$;

create or replace function public.mark_monitor_digest_delivery_failure(
  p_id uuid, p_attempts integer, p_error text, p_next_attempt_at timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries set
    status = case when p_next_attempt_at is null then 'failed' else 'retry' end,
    attempts = p_attempts + 1, last_error = p_error,
    next_attempt_at = p_next_attempt_at, updated_at = timezone('utc', now())
  where id = p_id;
$$;

create or replace function public.mark_monitor_digest_delivery_disabled(p_id uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries
    set status = 'disabled', last_error = p_reason, updated_at = timezone('utc', now())
    where id = p_id;
$$;

drop trigger if exists monitor_rules_set_updated_at on public.monitor_rules;
create trigger monitor_rules_set_updated_at
  before update on public.monitor_rules
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Verify the migration validator accepts it**

Run: `npm run validate:migrations`
Expected: PASS. If it reports the new file is not listed, add `202608050001_p10_monitor_rules.sql` to the expected-order list inside `scripts/validate-migrations.ts` after the P9 entry, then re-run.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608050001_p10_monitor_rules.sql scripts/validate-migrations.ts
git commit -m "feat(p10): add monitor rules, breaches, digests, and deliveries migration"
```

---

### Task 4: Store layer

**Files:**
- Create: `server/monitors/store.ts`

**Interfaces:**
- Consumes: Task 3 RPCs; `serviceClient()` from `server/cloud/store.js` (check the exact export name in that file and reuse it — do not create a second client).
- Produces:
  - `MonitorRuleRow` — `{ id, user_id, portfolio_id, thesis_id, symbol, kind, spec, enabled, state, last_outcome, last_evaluated_at, min_interval_hours, next_evaluation_at, rule_version }`
  - `claimDueMonitorRules(limit: number): Promise<readonly MonitorRuleRow[]>`
  - `recordMonitorEvaluation(input: { ruleId, outcome, state, observation, error, nextEvaluationAt }): Promise<void>`
  - `openMonitorDigest(userId: string): Promise<{ id: string }>`
  - `appendMonitorBreach(input: AppendBreachInput): Promise<string>`
  - `enqueueMonitorDigestDeliveries(digestId: string, payload: unknown): Promise<number>`
  - `claimDueMonitorDigestDeliveries(limit: number): Promise<readonly MonitorDigestDeliveryRow[]>`
  - `markMonitorDigestDeliverySent(id)`, `markMonitorDigestDeliveryFailure(id, attempts, error, nextAttemptAt)`, `markMonitorDigestDeliveryDisabled(id, reason)`
  - `listMonitorRules(userId, portfolioId)`, `upsertMonitorRule(input)`, `deleteMonitorRule(userId, ruleId)`, `listMonitorBreaches(userId, ruleId, limit)`

- [ ] **Step 1: Read the existing store to copy its conventions**

Read `server/portfolio/store.ts` lines 1180-1218 (`claimDueRebalanceDeliveries`, `markRebalanceDeliverySent`, `markRebalanceDeliveryFailure`). Copy the client access, `.rpc(...)` call shape, error handling, and `Object.freeze` usage exactly. Do not invent a different pattern.

- [ ] **Step 2: Write `server/monitors/store.ts`**

One thin function per RPC. Each returns frozen data. Each throws on `error` from Supabase with the same message shape the portfolio store uses.

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck:strict`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add server/monitors/store.ts
git commit -m "feat(p10): add monitor store layer over the P10 RPCs"
```

---

### Task 5: Extract shared delivery primitives

Refactor only. `server/notifications/rebalances.ts` behaviour must not change — its retry policy, timeouts, and subscription pruning are what Task 7 will reuse, and forking them would let the two copies drift.

**Files:**
- Create: `server/notifications/delivery.ts`
- Modify: `server/notifications/rebalances.ts`

**Interfaces:**
- Produces:
  - `retryAt(attempts: number): string | null` — `min(3600, 30 * 2^(attempts-1))` seconds ahead, `null` at 5 attempts.
  - `withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>`
  - `sendEmailMessage(input: { userId, subject, text, idempotencyKey }): Promise<void>`
  - `sendPushMessage(input: { userId, title, body, url, tag }): Promise<void>`
  - `drainQueue<TRow>(rows, deliverOne, concurrency): Promise<{ attempted, sent, failed }>`

- [ ] **Step 1: Move `retryAt` and `withTimeout` verbatim into `delivery.ts` and re-export**

Cut both functions from `rebalances.ts` into `delivery.ts` unchanged. Import them back in `rebalances.ts`.

- [ ] **Step 2: Run the existing tests to confirm nothing moved semantically**

Run: `npm run test`
Expected: PASS, 102 tests, same count as before.

- [ ] **Step 3: Generalise the senders**

`sendEmail(row)` and `sendPush(row)` in `rebalances.ts` currently take a `RebalanceDeliveryRow` and read `row.user_id` plus rebalance-specific copy. Split each into a generic sender in `delivery.ts` that takes `userId` and already-composed strings, and leave the rebalance-specific subject/body composition in `rebalances.ts`. Keep the 404/410 subscription pruning and the "no active subscription accepted" error inside the generic push sender.

- [ ] **Step 4: Generalise the worker pool**

Move the cursor-based worker loop at the bottom of `deliverPendingRebalances` into `drainQueue`. `deliverPendingRebalances` becomes: claim rows, call `drainQueue(rows, deliverOne, config.deliveryConcurrency)`.

- [ ] **Step 5: Verify behaviour is unchanged**

Run: `npm run check`
Expected: exit 0, 102 tests passing.

- [ ] **Step 6: Commit**

```bash
git add server/notifications/delivery.ts server/notifications/rebalances.ts
git commit -m "refactor(p10): extract shared notification delivery primitives"
```

---

### Task 6: Observation loader and monitor service

**Files:**
- Create: `server/monitors/observations.ts`
- Create: `server/monitors/monitor-service.ts`
- Create: `server/monitors/monitor-service.test.ts`

**Interfaces:**
- Consumes: `buildPortfolioSummary(userId, portfolioId, requestId): Promise<PortfolioSummary>` from `server/portfolio/service.js`; `evaluateRule`, `nextState`, `shouldNotify` from Task 2; the store from Task 4.
- Produces:
  - `buildMonitorObservation(userId, portfolioId, requestId): Promise<MonitorObservation>`
  - `MonitorRunResult` — `{ claimed, evaluated, breached, deferred, errored, digests, portfolios, budgetExhausted }`
  - `monitorRules(requestId: string, deadlineMs: number): Promise<MonitorRunResult>`

- [ ] **Step 1: Write `observations.ts`**

```ts
// server/monitors/observations.ts
import { buildPortfolioSummary } from '../portfolio/service.js';
import type { MonitorObservation } from './evaluate.js';

/**
 * One shared observation per portfolio. Uses the same call the snapshot Cron makes, so the
 * quality semantics here are identical to the ones that gate a strict snapshot.
 */
export async function buildMonitorObservation(
  userId: string,
  portfolioId: string,
  requestId: string,
): Promise<MonitorObservation> {
  const summary = await buildPortfolioSummary(userId, portfolioId, requestId);
  return Object.freeze({
    portfolioId,
    asOfISO: summary.asOfISO,
    valuationQuality: summary.valuationQuality,
    holdings: summary.holdings,
    risk: summary.risk,
    summary,
    unverifiedSinceISO: unverifiedClock(summary.holdings),
  });
}

/**
 * For each currently-unverified holding, the provider timestamp is the age of the newest
 * price the provider was willing to give — which is exactly the clock a
 * `no_verified_price_days` rule asks about. Holdings without provenance are omitted, and
 * the evaluator defers on an omission rather than reporting a false `clear`.
 */
function unverifiedClock(
  holdings: readonly PortfolioHolding[],
): Readonly<Record<string, string>> {
  const clock: Record<string, string> = {};
  for (const holding of holdings) {
    if (holding.valuationQuality === 'verified') continue;
    const timestamp = holding.provenance?.providerTimestamp;
    if (timestamp) clock[holding.symbol] = timestamp;
  }
  return Object.freeze(clock);
}
```

Add `import type { PortfolioHolding } from '../../src/shared/api.js';` to the file.

- [ ] **Step 2: Write the failing service test**

```ts
// server/monitors/monitor-service.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/monitors/monitor-service.test.ts`
Expected: FAIL — cannot resolve `./monitor-service.js`.

- [ ] **Step 4: Write `monitor-service.ts`**

Export the two pure helpers under test:

```ts
export interface PortfolioRuleGroup {
  readonly userId: string;
  readonly portfolioId: string;
  readonly rules: readonly MonitorRuleRow[];
}

export function groupRulesByPortfolio(rows: readonly MonitorRuleRow[]): readonly PortfolioRuleGroup[] {
  const byPortfolio = new Map<string, MonitorRuleRow[]>();
  for (const row of rows) {
    const existing = byPortfolio.get(row.portfolio_id);
    if (existing) existing.push(row);
    else byPortfolio.set(row.portfolio_id, [row]);
  }
  return Object.freeze([...byPortfolio.entries()].map(([portfolioId, rules]) =>
    Object.freeze({ portfolioId, userId: rules[0].user_id, rules: Object.freeze(rules) })));
}

export function nextEvaluationAt(outcome: string, intervalHours: number, nowMs: number): string {
  if (outcome === 'deferred' || outcome === 'error') return new Date(nowMs).toISOString();
  return new Date(nowMs + intervalHours * 3_600_000).toISOString();
}
```

Then `monitorRules(requestId, deadlineMs)`:

1. `claimDueMonitorRules(config.monitorRuleLimit)`.
2. `groupRulesByPortfolio(rows)`.
3. For each group, **before starting**, check `Date.now() < deadlineMs - PORTFOLIO_BUDGET_MS` where `PORTFOLIO_BUDGET_MS = 4_000`. If not, set `budgetExhausted = true` and stop. Unclaimed and unevaluated rules keep their existing `next_evaluation_at`, so the next run takes them.
4. Build the observation once via `buildMonitorObservation`. If it throws, record `error` for every rule in the group and continue to the next group — one bad portfolio must not end the run.
5. For each rule: `evaluateRule`, then `nextState` and `shouldNotify`.
6. When `shouldNotify` is true: `openMonitorDigest(userId)` (memoised per user for this run), then `appendMonitorBreach`.
7. `recordMonitorEvaluation` for every rule regardless of outcome.
8. After all groups, for each opened digest call `buildDigestPayload` (Task 7) and `enqueueMonitorDigestDeliveries`.

Wrap each rule's evaluation in `try/catch`; on throw record outcome `error` with the message and continue.

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/monitors/monitor-service.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add server/monitors/observations.ts server/monitors/monitor-service.ts server/monitors/monitor-service.test.ts
git commit -m "feat(p10): add observation loader and deadline-aware monitor service"
```

---

### Task 7: Digest assembly and delivery

**Files:**
- Create: `server/monitors/digest.ts`
- Create: `server/monitors/digest.test.ts`
- Create: `server/notifications/monitors.ts`

**Interfaces:**
- Consumes: `sendEmailMessage`, `sendPushMessage`, `retryAt`, `drainQueue` from Task 5; the store from Task 4.
- Produces:
  - `MonitorDigestPayload` — `{ breachCount, items: readonly { kind, symbol?, label, observedValue, threshold }[], url }`
  - `buildDigestPayload(breaches, publicOrigin): MonitorDigestPayload`
  - `digestSubject(payload)`, `digestBody(payload)`
  - `deliverPendingMonitorDigests(): Promise<{ attempted: number; sent: number; failed: number }>`

- [ ] **Step 1: Write the failing digest test**

```ts
// server/monitors/digest.test.ts
import { describe, expect, it } from 'vitest';
import { buildDigestPayload, digestBody, digestSubject } from './digest.js';

const breaches = [
  { kind: 'thesis_invalidation', symbol: 'AAPL', observed_value: 190, threshold_value: 195 },
  { kind: 'risk_threshold', symbol: null, observed_value: 38, threshold_value: 35 },
] as never;

describe('buildDigestPayload', () => {
  it('summarises every breach in the run', () => {
    const payload = buildDigestPayload(breaches, 'https://finance.example.com');
    expect(payload.breachCount).toBe(2);
    expect(payload.items).toHaveLength(2);
    expect(payload.url).toBe('https://finance.example.com/#/portfolio?tab=monitors');
  });

  it('falls back to a relative url when no public origin is configured', () => {
    expect(buildDigestPayload(breaches, '').url).toBe('/#/portfolio?tab=monitors');
  });
});

describe('digest copy', () => {
  it('names the breach count in the subject', () => {
    const payload = buildDigestPayload(breaches, '');
    expect(digestSubject(payload)).toContain('2');
  });

  it('states that no order was placed and the ledger is untouched', () => {
    const body = digestBody(buildDigestPayload(breaches, ''));
    expect(body).toContain('자동 주문이 아닙니다');
    expect(body).toContain('거래 원장');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/monitors/digest.test.ts`
Expected: FAIL — cannot resolve `./digest.js`.

- [ ] **Step 3: Write `digest.ts`**

`digestBody` must contain the literal strings `자동 주문이 아닙니다` and `거래 원장` — the same boundary statement the rebalance notification carries. Label each item by kind: thesis rules read `${symbol} 투자논거 무효화 조건 충족`, risk rules read `${metric} ${observed} (임계 ${threshold})`, stress rules read `스트레스 예상 손실 ${observed}% (임계 ${threshold}%)`.

- [ ] **Step 4: Write `server/notifications/monitors.ts`**

Mirror `deliverPendingRebalances` exactly, substituting the monitor store functions and `pf-monitor-${digest_id}-email` as the idempotency key.

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/monitors/digest.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add server/monitors/digest.ts server/monitors/digest.test.ts server/notifications/monitors.ts
git commit -m "feat(p10): add monitor digest assembly and delivery"
```

---

### Task 8: Config and Cron integration

**Files:**
- Modify: `server/config.ts`
- Modify: `routes/cron/daily-maintenance.ts`

**Interfaces:**
- Consumes: `monitorRules` from Task 6, `deliverPendingMonitorDigests` from Task 7.
- Produces: `config.monitorRuleLimit`, `config.monitorBudgetMs`.

- [ ] **Step 1: Add config fields**

In `server/config.ts`, add to the config interface beside `alertBatchSize`:

```ts
  readonly monitorRuleLimit: number;
  readonly monitorBudgetMs: number;
```

and to the loader beside `alertBatchSize: numberValue('ALERT_BATCH_SIZE', 250, 1, 500),`:

```ts
    monitorRuleLimit: numberValue('MONITOR_RULE_LIMIT', 200, 1, 600),
    monitorBudgetMs: numberValue('MONITOR_BUDGET_MS', 25_000, 1_000, 55_000),
```

- [ ] **Step 2: Append the two steps to daily maintenance**

In `routes/cron/daily-maintenance.ts`, after `const rebalanceDelivery = await deliverPendingRebalances();`:

```ts
  // Monitors run last on purpose. Contributions and rebalances create reviewable plans that
  // lead to ledger writes; monitors only notify. If the 60s budget runs short, dropping a
  // day of monitoring costs less than dropping a contribution.
  const monitorDeadlineMs = Date.now() + loadConfig().monitorBudgetMs;
  const monitor = await monitorRules(`${requestId}:monitor`, monitorDeadlineMs);
  const monitorDelivery = await deliverPendingMonitorDigests();
```

Add `monitor` and `monitorDelivery` to the returned `json(...)` object, and add the imports:

```ts
import { loadConfig } from '../../server/config.js';
import { monitorRules } from '../../server/monitors/monitor-service.js';
import { deliverPendingMonitorDigests } from '../../server/notifications/monitors.js';
```

- [ ] **Step 3: Confirm no Cron schedule was added**

Run: `git diff --exit-code vercel.json`
Expected: exit 0 — no output. If `vercel.json` changed, revert it. The Hobby plan allows two schedules and both are in use.

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/config.ts routes/cron/daily-maintenance.ts
git commit -m "feat(p10): run monitors and digest delivery in daily maintenance"
```

---

### Task 9: API routes

**Files:**
- Create: `routes/portfolio/monitor-rules.ts`
- Create: `routes/portfolio/monitor-status.ts`
- Modify: `routes/registry.ts`

**Interfaces:**
- Consumes: the store from Task 4, `parseMonitorRuleSpec` and `defaultIntervalHours` from Task 1.
- Produces: `GET/POST/PATCH/DELETE /api/portfolio/monitor-rules`, `GET /api/portfolio/monitor-status`.

- [ ] **Step 1: Read an existing authenticated route to copy its shape**

Read `routes/portfolio/allocation.ts` (registered as `GET/PUT /api/portfolio/allocation`). Copy its auth extraction, method dispatch, Zod body validation, `ApiError` codes, and response envelope exactly.

- [ ] **Step 2: Write `monitor-rules.ts`**

- `GET` — `listMonitorRules(userId, portfolioId)`.
- `POST` — validate body with `parseMonitorRuleSpec`, default `minIntervalHours` to `defaultIntervalHours(kind)`, call `upsertMonitorRule` with `p_rule_id = null`.
- `PATCH` — same validation, pass the existing `ruleId`.
- `DELETE` — `deleteMonitorRule(userId, ruleId)`.

`POST` and `PATCH` require an `Idempotency-Key` header, matching the transaction and rebalance mutation convention documented in `README.md`.

- [ ] **Step 3: Write `monitor-status.ts`**

`GET` returns, per rule: `state`, `lastOutcome`, `lastEvaluatedAt`, `lastObservation`, `nextEvaluationAt`, and the most recent breaches from `listMonitorBreaches(userId, ruleId, 20)`.

- [ ] **Step 4: Register both routes**

Add both to `routes/registry.ts` following the existing entries.

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add routes/portfolio/monitor-rules.ts routes/portfolio/monitor-status.ts routes/registry.ts
git commit -m "feat(p10): add monitor rule and status API routes"
```

---

### Task 10: User interface

**Files:**
- Create: `src/features/portfolio/MonitorRuleEditor.tsx`
- Create: `src/features/portfolio/MonitorStatusPanel.tsx`
- Modify: `src/features/portfolio/ThesisDialog.tsx`
- Modify: `src/features/portfolio/PortfolioPage.tsx`

**Interfaces:**
- Consumes: the Task 9 endpoints via `apiFetch` from `src/live/apiClient.js`.
- Produces: `MonitorRuleEditor` (props: `portfolioId`, `thesisId?`, `symbol?`, `allowedKinds`), `MonitorStatusPanel` (props: `portfolioId`).

- [ ] **Step 1: Build `MonitorRuleEditor`**

One shared form, so the thesis host and the risk-panel host cannot drift. `allowedKinds` restricts the kind selector: `['thesis_invalidation']` inside `ThesisDialog`, `['risk_threshold', 'stress_scenario']` in the risk panel. Follow the existing dialog form patterns in `TargetAllocationDialog.tsx` for field layout, validation display, and submit handling.

- [ ] **Step 2: Mount it in `ThesisDialog`**

Place it directly beneath the prose invalidation textarea, with copy making the relationship explicit: the prose is the record, the rule is what gets watched.

- [ ] **Step 3: Build `MonitorStatusPanel`**

Per rule show latch `state`, `lastOutcome`, last evaluation time, last observed value, next scheduled evaluation, and breach history. When `lastOutcome === 'deferred'`, show the stored reason prominently — this is the panel's main job. Someone asking "why didn't it fire?" must get the answer here rather than by reading logs.

- [ ] **Step 4: Mount the panel and the portfolio-level editor in `PortfolioPage`**

Add both to the existing risk panel region.

- [ ] **Step 5: Verify in a browser**

Run `npm run dev`, open `http://localhost:5602/#/portfolio`, and confirm the editor renders, validation errors display, and the status panel lists rules. `npm run check` does not render these components, so this step is the only coverage they get.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/portfolio/MonitorRuleEditor.tsx src/features/portfolio/MonitorStatusPanel.tsx src/features/portfolio/ThesisDialog.tsx src/features/portfolio/PortfolioPage.tsx
git commit -m "feat(p10): add monitor rule editor and status panel"
```

---

### Task 11: Validation script, version bump, and documentation

**Files:**
- Create: `scripts/validate-p10.ts`
- Create: `P10_CHANGELOG.md`
- Modify: `package.json`, `server/config.ts`, `server/http/api-router.test.ts`, `scripts/validate-p3.ts`, `scripts/validate-p5.ts`, `scripts/postdeploy-smoke.ts`, `README.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `DEPLOYMENT.md`

- [ ] **Step 1: Write `scripts/validate-p10.ts`**

Follow `scripts/validate-p9.ts` exactly. Assert:
- `loadConfig().version === '1.11.0'`
- `parseMonitorRuleSpec` rejects an unknown risk metric and an empty shock list
- `evaluateRule` returns `deferred` when `valuationQuality !== 'verified'`
- `evaluateRule` returns `deferred` when `risk.dataQuality !== 'verified'`
- `shouldNotify('latched', 'breached') === false` and `shouldNotify('armed', 'breached') === true`
- `nextState('armed', 'deferred') === 'armed'` and `nextState('latched', 'deferred') === 'latched'`
- `nextEvaluationAt('deferred', 168, now)` equals `now`
- the migration file exists and contains `create table if not exists public.monitor_rules`
- `vercel.json` still declares exactly 2 cron entries

- [ ] **Step 2: Wire it into the gate**

In `package.json`, add `"validate:p10": "tsx scripts/validate-p10.ts"` and insert `&& npm run validate:p10` into `check` immediately after `validate:p9`.

- [ ] **Step 3: Bump the version to 1.11.0**

Run to find every literal:

```bash
grep -rn "1\.10\.0" --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json .
```

Update each occurrence in `package.json`, `server/config.ts`, `server/http/api-router.test.ts`, `scripts/validate-p3.ts`, `scripts/validate-p5.ts`, `scripts/postdeploy-smoke.ts`, and the doc headers. Leave the historical `P9_CHANGELOG.md` sentences that describe P9 as shipping at 1.10.0 — those are correct history.

- [ ] **Step 4: Write `P10_CHANGELOG.md`**

Follow `P9_CHANGELOG.md`'s section structure: Added, Monitoring rules, Safety boundary, Database. State plainly that monitors place no orders, never transition thesis status, and never fire on unverified input.

- [ ] **Step 5: Update the four long-form docs**

- `README.md` — a P10 capabilities section, the two new routes in the API list, the new migration in the migration order list, and `validate:p10` in the validation commands.
- `ARCHITECTURE.md` — the `server/monitors/` module and its data flow.
- `CONTRACT.md` — request/response shapes for both new endpoints.
- `DEPLOYMENT.md` — `MONITOR_RULE_LIMIT` and `MONITOR_BUDGET_MS`, and that the P10 migration applies after P9.

- [ ] **Step 6: Verify the whole gate**

Run: `npm run check`
Expected: exit 0, including `validate:p10`.

Run: `npm audit --audit-level=low`
Expected: 0 vulnerabilities.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(p10): add validation script, bump to 1.11.0, and document monitoring"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: rule schema and the three kinds → Tasks 1, 3; quality gate and latch → Task 2; evidence tables → Task 3; shared observation → Task 6; shared delivery extraction → Task 5; digest and latch-driven notification → Task 7; deadline budget, ordering, and no third Cron → Task 8; rule editing beside the thesis and the status surface → Tasks 9, 10; testing, migration, version bump, safety-boundary docs → Task 11.

**Type consistency.** `MonitorObservation`, `MonitorRuleInput`, and `EvaluationOutcome` are defined once in Task 2 and referenced unchanged in Tasks 6 and 11. `retryAt`, `withTimeout`, and `drainQueue` are defined in Task 5 and consumed in Task 7. Store function names in Task 4 match their call sites in Tasks 6, 7, and 9. `nextEvaluationAt` and `groupRulesByPortfolio` are defined and tested in Task 6 and re-asserted in Task 11.

**Two deviations from the spec, both deliberate:**

1. The spec described the observation as "the latest verified `portfolio_snapshots` row plus quotes". The plan uses `buildPortfolioSummary` instead — the same call `snapshot-portfolios` makes. It already loads quotes internally and returns holdings with `averageCost`, `price`, `allocationPct`, and `valuationQuality`, plus the full `PortfolioRiskMetrics`, in one call. It also makes the quality semantics here byte-identical to the ones gating a strict snapshot, rather than a second implementation that could drift. `runPortfolioScenario(summary, shocks)` needs a `PortfolioSummary` anyway.
2. `no_verified_price_days` deliberately bypasses the per-holding verified check, since the condition is *about* the absence of verification. It reads `unverifiedSinceISO` instead. Every other thesis condition still requires a verified holding.

**One bug caught in review and fixed in the plan.** The first draft of `evaluateThesis` returned `clear` when a `no_verified_price_days` rule found no entry in `unverifiedSinceISO`. That is wrong in the case that matters: a holding can be unverified *and* carry no provider timestamp, and reporting `clear` would silence the exact rule meant to catch a price going stale. The evaluator now returns `clear` only when the holding is currently verified, and `deferred` when it is unverified with no known timestamp. Two tests in Task 2 pin both halves.
