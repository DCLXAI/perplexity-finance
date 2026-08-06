import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import type { PortfolioOrderCostPolicy } from '../src/shared/api.js';
import {
  estimateActualPortfolioOrderCosts,
  optimizePortfolioOrders,
} from '../src/domain/portfolio/order-optimizer.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.11.0');

function policy(overrides: Partial<PortfolioOrderCostPolicy> = {}): PortfolioOrderCostPolicy {
  return Object.freeze({
    commissionFixedUsd: 0,
    commissionBps: 0,
    buySlippageBps: 0,
    sellSlippageBps: 0,
    sellTransactionTaxBps: 0,
    capitalGainsTaxPct: 0,
    maxCostPct: 2,
    taxLotMethod: 'fifo',
    ...overrides,
  });
}

const fittedContribution = optimizePortfolioOrders({
  mode: 'contribution',
  cashBalance: 100,
  requiredCashReserve: 0,
  minTradeValue: 1,
  policy: policy({
    commissionFixedUsd: 0.01,
    commissionBps: 1,
    buySlippageBps: 5,
    maxCostPct: 10,
  }),
  candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: 100, referencePrice: 10 }],
});
assert.equal(fittedContribution.status, 'partial');
assert.deepEqual(
  fittedContribution.orders.map((order) => ({
    action: order.action,
    requested: order.requestedTradeValue,
    optimized: order.tradeValue,
    decision: order.optimizationDecision,
  })),
  [{ action: 'buy', requested: 100, optimized: 99.93, decision: 'cash-limited' }],
);
assert.deepEqual(fittedContribution.orders[0]?.estimatedCosts, {
  commission: 0.02,
  slippage: 0.05,
  transactionTax: 0,
  capitalGainsTax: 0,
  tax: 0,
  taxableGain: 0,
  total: 0.07,
  netCashEffect: -100,
});
assert.equal(fittedContribution.estimatedExecutionCashAfter, 0);

const fifoLots = Object.freeze([
  Object.freeze({
    transactionId: 'buy-1',
    symbol: 'AAA',
    acquiredAt: '2025-01-01T15:00:00.000Z',
    quantity: 10,
    unitCost: 101,
  }),
  Object.freeze({
    transactionId: 'buy-2',
    symbol: 'AAA',
    acquiredAt: '2025-02-01T15:00:00.000Z',
    quantity: 10,
    unitCost: 200,
  }),
]);
const taxableSale = optimizePortfolioOrders({
  mode: 'rebalance',
  cashBalance: 0,
  requiredCashReserve: 0,
  minTradeValue: 10,
  policy: policy({ commissionFixedUsd: 15, capitalGainsTaxPct: 20, maxCostPct: 100 }),
  openLots: fifoLots,
  candidates: [{ symbol: 'AAA', action: 'sell', requestedTradeValue: 4_500, referencePrice: 300 }],
});
assert.equal(taxableSale.status, 'available');
assert.equal(taxableSale.orders[0]?.estimatedCostBasis, 2_010);
assert.equal(taxableSale.orders[0]?.taxLotSnapshot.length, 2);
assert.equal(taxableSale.orders[0]?.estimatedCosts.capitalGainsTax, 495);
assert.equal(taxableSale.estimatedExecutionCashAfter, 4_485);
assert.equal(taxableSale.estimatedTaxReserve, 495);
assert.equal(taxableSale.estimatedSpendableCashAfter, 3_990);

const uneconomic = optimizePortfolioOrders({
  mode: 'contribution',
  cashBalance: 10,
  requiredCashReserve: 0,
  minTradeValue: 0.01,
  policy: policy({ commissionFixedUsd: 0.1, maxCostPct: 5 }),
  candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: 1, referencePrice: 1 }],
});
assert.deepEqual(
  {
    action: uneconomic.orders[0]?.action,
    decision: uneconomic.orders[0]?.optimizationDecision,
    chargedCost: uneconomic.orders[0]?.estimatedCosts.total,
  },
  { action: 'hold', decision: 'cost-inefficient', chargedCost: 0 },
);

const actualSale = estimateActualPortfolioOrderCosts({
  symbol: 'AAA',
  action: 'sell',
  quantity: 15,
  referencePrice: 300,
  actualPrice: 300,
  actualCommission: 15,
  policy: policy({ capitalGainsTaxPct: 20, maxCostPct: 100 }),
  openLots: fifoLots,
});
assert.equal(actualSale.costs.capitalGainsTax, 495);
assert.equal(actualSale.costs.netCashEffect, 4_485, 'estimated tax must not be represented as a paid ledger debit');

const favorableBuy = estimateActualPortfolioOrderCosts({
  symbol: 'AAA',
  action: 'buy',
  quantity: 1,
  referencePrice: 100,
  actualPrice: 98.991,
  actualCommission: 0,
  policy: policy(),
});
assert.equal(favorableBuy.costs.slippage, -1, 'price improvement must retain signed slippage');

const migration = readFileSync(
  new URL('../supabase/migrations/202607140002_p9_order_cost_optimization.sql', import.meta.url),
  'utf8',
).toLowerCase();
for (const contract of [
  'commission_fixed_usd',
  'commission_bps',
  'buy_slippage_bps',
  'sell_slippage_bps',
  'sell_transaction_tax_bps',
  'capital_gains_tax_pct',
  'max_cost_pct',
  'replace_portfolio_allocation_policy_p9',
  'cost_model_version',
  'cost_policy_snapshot',
  'requested_trade_value',
  'optimization_decision',
  'estimated_costs',
  'estimated_cost_basis',
  'tax_lot_snapshot',
  'actual_costs',
  'create_portfolio_rebalance_run_p8',
  'complete_portfolio_rebalance_run_p8',
  'create_portfolio_contribution_run_p8',
  'complete_portfolio_contribution_run_p8',
  'apply_p9_plan_costs',
  'validate_p9_actual_costs',
  'persist_p9_actual_costs',
  'quantity_value > item.estimated_quantity',
  "cost_policy_snapshot->>'taxlotmethod' = 'fifo'",
]) assert.ok(migration.includes(contract), `missing P9 migration contract: ${contract}`);
assert.ok(!/grant\s+(insert|update|delete|all)[\s\S]{0,120}\s+to\s+(anon|authenticated)/i.test(migration));

const allocationApi = readFileSync(new URL('../routes/portfolio/allocation.ts', import.meta.url), 'utf8');
for (const contract of [
  'costPolicySchema',
  'commissionFixedUsd',
  'sellTransactionTaxBps',
  'capitalGainsTaxPct',
  'maxCostPct',
  "z.literal('fifo')",
]) assert.ok(allocationApi.includes(contract), `missing P9 allocation API contract: ${contract}`);

const store = readFileSync(new URL('../server/portfolio/store.ts', import.meta.url), 'utf8');
for (const contract of [
  "rpc('replace_portfolio_allocation_policy_p9'",
  'costModelVersion,',
  'costPolicySnapshot:',
  'requestedTradeValue:',
  'optimizationDecision:',
  'estimatedCosts:',
  'taxLotSnapshot:',
  'actualCosts:',
]) assert.ok(store.includes(contract), `missing P9 store contract: ${contract}`);

for (const relative of [
  '../server/portfolio/rebalance-service.ts',
  '../server/portfolio/contribution-service.ts',
]) {
  const service = readFileSync(new URL(relative, import.meta.url), 'utf8');
  for (const contract of [
    'optimizePortfolioOrders(',
    'estimateActualPortfolioOrderCosts(',
    'run.costModelVersion',
    'costPolicySnapshot',
    'estimatedCosts',
    'actualCosts',
  ]) assert.ok(service.includes(contract), `missing P9 service contract (${relative}): ${contract}`);
}

for (const relative of [
  '../src/features/portfolio/TargetAllocationDialog.tsx',
  '../src/features/portfolio/OrderCostBreakdown.tsx',
  '../src/features/portfolio/RebalanceWorkflowPanel.tsx',
  '../src/features/portfolio/RebalanceExecutionDialog.tsx',
  '../src/features/portfolio/GoalContributionPanel.tsx',
  '../src/features/portfolio/ContributionExecutionDialog.tsx',
]) assert.ok(readFileSync(new URL(relative, import.meta.url), 'utf8').length > 500, `missing P9 surface: ${relative}`);

for (const relative of [
  '../routes/portfolio/rebalances.ts',
  '../routes/portfolio/contributions.ts',
]) {
  const route = readFileSync(new URL(relative, import.meta.url), 'utf8');
  assert.ok(route.includes('rounded(value, 12)') && route.includes('rounded(value, 8)'),
    `missing fill precision normalization: ${relative}`);
}

console.log(JSON.stringify({
  version: '1.11.0',
  centSafeCostEnvelope: 'PASS',
  contributionCostFunding: 'PASS',
  deterministicFifoTaxEstimate: 'PASS',
  separateEstimatedTaxReserve: 'PASS',
  maximumCostFilter: 'PASS',
  signedActualSlippage: 'PASS',
  immutableCostEvidence: 'PASS',
  serverAndDatabaseRevalidation: 'PASS',
  noAutomaticBrokerOrTaxPayment: 'PASS',
  result: 'PASS',
}, null, 2));
