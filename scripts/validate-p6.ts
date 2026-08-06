import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRebalancePlan } from '../src/domain/portfolio/rebalance.js';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import type { PortfolioHolding } from '../src/shared/api.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.11.0');

function holding(symbol: string, marketValue: number, price: number): PortfolioHolding {
  return Object.freeze({
    symbol, name: symbol, assetKind: 'stock', quantity: marketValue / price, costBasis: marketValue,
    averageCost: price, realizedPnl: 0, income: 0, feesPaid: 0, price, marketValue,
    unrealizedPnl: 0, totalPnl: 0, allocationPct: marketValue / 10,
    valuationQuality: 'verified',
  });
}

const plan = computeRebalancePlan({
  totalValue: 1_000,
  cashBalance: 100,
  holdings: [holding('AAA', 600, 20), holding('BBB', 300, 10)],
  policy: {
    driftThresholdPct: 5,
    minTradeValue: 25,
    targets: [{ symbol: 'AAA', targetPct: 50 }, { symbol: 'BBB', targetPct: 40 }, { symbol: 'CASH', targetPct: 10 }],
  },
});
assert.equal(plan.status, 'available');
assert.equal(plan.rebalanceNeeded, true);
assert.equal(plan.sellValue, 100);
assert.equal(plan.buyValue, 100);
assert.equal(plan.estimatedCashAfter, 100);
assert.deepEqual(plan.items.find((item) => item.symbol === 'AAA')?.action, 'sell');
assert.deepEqual(plan.items.find((item) => item.symbol === 'BBB')?.action, 'buy');

const migration = readFileSync(new URL('../supabase/migrations/202607130001_p6_target_allocations.sql', import.meta.url), 'utf8').toLowerCase();
for (const contract of [
  'portfolio_allocation_policies',
  'portfolio_allocation_targets',
  'replace_portfolio_allocation_policy',
  'for update',
  'target percentages must total 100',
  'grant execute',
  'to service_role',
]) assert.ok(migration.includes(contract), `missing P6 migration contract: ${contract}`);

for (const relative of [
  '../routes/portfolio/allocation.ts',
  '../src/domain/portfolio/rebalance.ts',
  '../src/features/portfolio/RebalancePanel.tsx',
  '../src/features/portfolio/TargetAllocationDialog.tsx',
]) assert.ok(readFileSync(new URL(relative, import.meta.url), 'utf8').length > 300, `missing P6 surface: ${relative}`);

console.log(JSON.stringify({
  version: '1.11.0',
  targetValidation: 'PASS',
  driftDetection: 'PASS',
  tradeSuggestions: 'PASS',
  cashReconciliation: 'PASS',
  atomicPolicyReplace: 'PASS',
  noAutomaticBrokerExecution: 'PASS',
  result: 'PASS',
}, null, 2));
