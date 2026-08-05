import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import { evaluateRule, nextState, shouldNotify } from '../server/monitors/evaluate.js';
import type { MonitorObservation, MonitorRuleInput } from '../server/monitors/evaluate.js';
import { nextEvaluationAt } from '../server/monitors/monitor-service.js';
import { parseMonitorRuleSpec } from '../server/monitors/rules.js';
import type { PortfolioHolding, PortfolioRiskMetrics, PortfolioSummary } from '../src/shared/api.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.11.0');

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
    // runPortfolioScenario reads cashBalance; omitting it yields NaN (see
    // server/monitors/evaluate.test.ts), which would defer rather than judge the stress rule.
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

// --- parseMonitorRuleSpec: rejection tests ---------------------------------------------------

assert.throws(
  () => parseMonitorRuleSpec('risk_threshold', { metric: 'not_a_real_metric', comparison: 'above', value: 10 }),
  ZodError,
  'unknown risk metric must be rejected',
);

assert.throws(
  () => parseMonitorRuleSpec('stress_scenario', { shocks: [], maxProjectedLossPct: 20 }),
  ZodError,
  'empty shock list must be rejected',
);

// A 0 threshold breaches on any projected loss, so the rule latches permanently on its first
// evaluation and can never notify again.
assert.throws(
  () => parseMonitorRuleSpec('stress_scenario', {
    shocks: [{ targetType: 'all', target: '*', changePct: -30 }],
    maxProjectedLossPct: 0,
  }),
  ZodError,
  'maxProjectedLossPct of 0 must be rejected',
);

// The nested shock object must be .strict() like every other union member.
assert.throws(
  () => parseMonitorRuleSpec('stress_scenario', {
    shocks: [{ targetType: 'all', target: '*', changePct: -30, unknownExtraKey: true }],
    maxProjectedLossPct: 20,
  }),
  ZodError,
  'stress shock must reject an unknown key (.strict())',
);

// resolveRuleSymbol derives the persisted symbol column FROM spec.symbol, so the route's own
// character-class check never reaches the stored value -- the spec schema has to carry it.
assert.throws(
  () => parseMonitorRuleSpec('thesis_invalidation', { condition: 'price_below', symbol: 'AAPL BAR', value: 195 }),
  ZodError,
  'a spec symbol with an illegal character must be rejected',
);

const validSpecs = {
  thesis_invalidation: { condition: 'price_below', symbol: 'AAPL', value: 195 },
  risk_threshold: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 20 },
  stress_scenario: { shocks: [{ targetType: 'all', target: '*', changePct: -30 }], maxProjectedLossPct: 20 },
} as const;
for (const [kind, spec] of Object.entries(validSpecs)) {
  // Sanity check: the valid fixture itself must parse before we assert the .strict() rejection.
  parseMonitorRuleSpec(kind as keyof typeof validSpecs, spec);
  assert.throws(
    () => parseMonitorRuleSpec(kind as keyof typeof validSpecs, { ...spec, unknownExtraKey: true }),
    ZodError,
    `${kind} spec must reject an unknown key (.strict())`,
  );
}

// --- evaluateRule: quality gate ---------------------------------------------------------------

assert.equal(
  evaluateRule(
    rule({
      kind: 'stress_scenario',
      spec: { shocks: [{ targetType: 'all', target: '*', changePct: -30 }], maxProjectedLossPct: 20 },
    }),
    observation({ valuationQuality: 'estimated' }),
  ).outcome,
  'deferred',
  'stress rule must defer when portfolio valuationQuality is not verified',
);

assert.equal(
  evaluateRule(rule(), observation({ holdings: [holding({ valuationQuality: 'estimated' })] })).outcome,
  'deferred',
  'thesis rule must defer when its watched holding is not verified',
);

// Load-bearing: a portfolio-wide gate would blind every thesis rule over one unrelated stale
// position. AAPL (watched, verified) must still be judged even though TSLA (unrelated, stale)
// makes portfolio-level valuationQuality 'mixed'.
assert.equal(
  evaluateRule(rule(), observation({
    valuationQuality: 'mixed',
    holdings: [holding(), holding({ symbol: 'TSLA', valuationQuality: 'estimated' })],
  })).outcome,
  'breached',
  'thesis rule on a verified holding must still judge when an unrelated holding is stale',
);

assert.equal(
  evaluateRule(
    rule({ kind: 'risk_threshold', spec: { metric: 'maxDrawdownPct', comparison: 'above', value: 5 } }),
    observation({ risk: risk({ dataQuality: 'synthetic' }) }),
  ).outcome,
  'deferred',
  'risk rule must defer when risk.dataQuality is not verified',
);

// --- latch transitions -------------------------------------------------------------------------

assert.equal(shouldNotify('latched', 'breached'), false);
assert.equal(shouldNotify('armed', 'breached'), true);
assert.equal(nextState('armed', 'deferred'), 'armed');
assert.equal(nextState('latched', 'deferred'), 'latched');

// --- nextEvaluationAt: a deferral must not consume the interval --------------------------------

const now = Date.parse('2026-08-05T00:00:00.000Z');
assert.equal(nextEvaluationAt('deferred', 168, now), new Date(now).toISOString());

// --- migration: presence, table, and complete revoke coverage for every security-definer RPC ---

const migration = readFileSync(
  new URL('../supabase/migrations/202608050001_p10_monitor_rules.sql', import.meta.url),
  'utf8',
);
assert.ok(
  migration.toLowerCase().includes('create table if not exists public.monitor_rules'),
  'migration must create public.monitor_rules',
);

const functionBlocks = [...migration.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\$\$;/g)];
assert.ok(functionBlocks.length > 0, 'migration must define at least one function');
const securityDefinerNames = functionBlocks
  .filter((match) => /security definer/.test(match[0]))
  .map((match) => match[1]);
// Guards the Critical hole found in the Task 3 review: 11 security-definer RPCs shipped with
// zero grants and were callable by any authenticated user. Every one must now be locked down.
assert.equal(securityDefinerNames.length, 11, `expected 11 security-definer functions, found ${securityDefinerNames.length}`);
assert.equal(new Set(securityDefinerNames).size, securityDefinerNames.length, 'duplicate security-definer function name');

const revokeNames = [...migration.matchAll(/revoke all on function public\.(\w+)\(/g)].map((match) => match[1]);
for (const name of securityDefinerNames) {
  assert.ok(revokeNames.includes(name), `missing "revoke all on function" for security-definer function: ${name}`);
}
const revokedSecurityDefinerNames = new Set(revokeNames.filter((name) => securityDefinerNames.includes(name)));
assert.equal(
  revokedSecurityDefinerNames.size,
  securityDefinerNames.length,
  'every security-definer function must have exactly one matching revoke',
);

// --- migration: the digest-delivery claim must recover stale `processing` rows -----------------

// Without this sweep a delivery whose worker died mid-flight is stranded forever: the digest is
// already 'dispatched' so open_monitor_digest will not reuse it, enqueue_monitor_digest_deliveries
// returns 0 on a repeat call, and the breached rules are 'latched' so shouldNotify stays false.
// The panel would show 경보 발동 and no notification would ever arrive.
const claimDigestDeliveries = migration.match(
  /create or replace function public\.claim_due_monitor_digest_deliveries\([\s\S]*?\$\$;/,
)?.[0] ?? '';
assert.ok(claimDigestDeliveries.length > 0, 'claim_due_monitor_digest_deliveries must exist');
assert.match(
  claimDigestDeliveries,
  /status = 'processing' and updated_at < timezone\('utc', now\(\)\) - interval '5 minutes'/,
  'claim_due_monitor_digest_deliveries must sweep stale processing rows, as p7 does',
);
assert.match(
  claimDigestDeliveries,
  /status = 'retry', next_attempt_at = timezone\('utc', now\(\)\)/,
  'the stale-processing sweep must return rows to retry with an immediate next attempt',
);

// --- vercel.json: still exactly two Cron entries -----------------------------------------------

const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  readonly crons: readonly unknown[];
};
assert.equal(vercelConfig.crons.length, 2, 'Vercel Hobby allows exactly two Cron schedules');

console.log(JSON.stringify({
  version: '1.11.0',
  strictSpecRejection: 'PASS',
  perScopeQualityGate: 'PASS',
  unrelatedStaleHoldingDoesNotBlindThesisRule: 'PASS',
  latchTransitionsAndNotification: 'PASS',
  deferralDoesNotConsumeInterval: 'PASS',
  migrationCreatesMonitorRules: 'PASS',
  everySecurityDefinerFunctionRevoked: 'PASS',
  staleProcessingDeliverySweep: 'PASS',
  exactlyTwoCronSchedules: 'PASS',
  result: 'PASS',
}, null, 2));
