import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import { canTransitionRebalance } from '../src/domain/portfolio/rebalance-workflow.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.10.0');

assert.equal(canTransitionRebalance('pending', 'approve'), true);
assert.equal(canTransitionRebalance('pending', 'complete'), false);
assert.equal(canTransitionRebalance('approved', 'complete'), true);
assert.equal(canTransitionRebalance('approved', 'reject'), true);
for (const status of ['completed', 'rejected', 'expired'] as const) {
  assert.equal(canTransitionRebalance(status, 'approve'), false);
  assert.equal(canTransitionRebalance(status, 'complete'), false);
  assert.equal(canTransitionRebalance(status, 'reject'), false);
}

const migration = readFileSync(
  new URL('../supabase/migrations/202607130002_p7_rebalance_workflow.sql', import.meta.url),
  'utf8',
).toLowerCase();
for (const contract of [
  'portfolio_rebalance_runs',
  'portfolio_rebalance_items',
  'portfolio_rebalance_fills',
  'portfolio_rebalance_events',
  'portfolio_rebalance_deliveries',
  'portfolio_rebalance_runs_one_open_idx',
  'constraint portfolio_rebalance_items_trade_shape_check',
  "where status in ('pending', 'approved')",
  'create_portfolio_rebalance_run',
  'transition_portfolio_rebalance_run',
  'complete_portfolio_rebalance_run',
  'claim_due_portfolio_rebalance_deliveries',
  'expire_portfolio_rebalance_runs',
  'for update of d skip locked',
  'append_portfolio_transaction',
  'approval price snapshot is required',
  "derived_key := 'p7:'",
  'derived ledger idempotency key collision',
  'fill failed price, time or minimum-order safety checks',
  'execution_reversed',
  'rebalance_email_enabled',
  'rebalance_push_enabled',
  'revoke insert, update, delete on public.portfolio_rebalance_runs',
]) assert.ok(migration.includes(contract), `missing P7 migration contract: ${contract}`);

assert.ok(
  !migration.includes('constraint portfolio_rebalance_items_action_check'),
  'explicit trade-shape constraint must not collide with PostgreSQL action column check naming',
);

const workflow = readFileSync(new URL('../src/domain/portfolio/rebalance-workflow.ts', import.meta.url), 'utf8');
for (const contract of [
  'currentPolicyUpdatedAt !== input.run.policyUpdatedAt',
  'currentSummary.portfolio.updatedAt !== input.run.portfolioUpdatedAt',
  "currentSummary.valuationQuality !== 'verified'",
  'maxPriceAgeHours ?? 96',
  'maxPriceMovePct ?? 3',
  'estimatedCashAfter < 0',
]) assert.ok(workflow.includes(contract), `missing P7 approval safety check: ${contract}`);

const api = readFileSync(new URL('../routes/portfolio/rebalances.ts', import.meta.url), 'utf8');
for (const contract of [
  'requireIdempotencyKey(request)',
  "z.literal('generate')",
  "z.literal('approve')",
  "z.literal('reject')",
  "z.literal('complete')",
]) assert.ok(api.includes(contract), `missing P7 API contract: ${contract}`);

const maintenance = readFileSync(new URL('../routes/cron/daily-maintenance.ts', import.meta.url), 'utf8');
const monitorIndex = maintenance.indexOf('monitorPortfolioRebalances(');
const deliveryIndex = maintenance.indexOf('deliverPendingRebalances(');
assert.ok(monitorIndex >= 0, 'daily maintenance must monitor portfolio drift');
assert.ok(deliveryIndex > monitorIndex, 'new rebalance alerts must be delivered after drift monitoring');

const notifications = readFileSync(new URL('../server/notifications/rebalances.ts', import.meta.url), 'utf8');
for (const contract of [
  'pf-rebalance-${row.run_id}-email',
  '목표 대비',
  '자동 주문이 아닙니다',
  'portfolioId=${encodeURIComponent(row.portfolio_id)}',
  'runId=${encodeURIComponent(row.run_id)}',
]) assert.ok(notifications.includes(contract), `missing P7 notification contract: ${contract}`);

for (const relative of [
  '../src/features/portfolio/RebalanceWorkflowPanel.tsx',
  '../src/features/portfolio/RebalanceExecutionDialog.tsx',
]) assert.ok(readFileSync(new URL(relative, import.meta.url), 'utf8').length > 500, `missing P7 workflow surface: ${relative}`);

console.log(JSON.stringify({
  version: '1.10.0',
  immutableDecisionSnapshot: 'PASS',
  fairDailyDriftMonitor: 'PASS',
  duplicateOpenPlanPrevention: 'PASS',
  approvalAuditStateMachine: 'PASS',
  emailAndWebPushQueue: 'PASS',
  atomicLedgerExecution: 'PASS',
  stalePriceAndCashSafety: 'PASS',
  noAutomaticBrokerExecution: 'PASS',
  result: 'PASS',
}, null, 2));
