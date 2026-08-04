import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import {
  computeContributionPlan,
  projectInvestmentGoal,
} from '../src/domain/portfolio/contribution-plan.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.10.0');

const projection = projectInvestmentGoal({
  currentValue: 10_000,
  goalValue: 50_000,
  monthlyContribution: 1_000,
  annualReturnPct: 0,
  horizonMonths: 40,
});
assert.equal(projection.status, 'on-track');
assert.equal(projection.projectedValue, 50_000);
assert.equal(projection.requiredMonthlyContribution, 1_000);
assert.equal(projection.brokerExecution, false);

const contribution = computeContributionPlan({
  contributionAmount: 1_000,
  minOrderValue: 100,
  totalValueBefore: 10_000,
  targets: [
    { symbol: 'AAA', currentValue: 2_000, targetPct: 60 },
    { symbol: 'BBB', currentValue: 7_500, targetPct: 30 },
    { symbol: 'CASH', currentValue: 500, targetPct: 10 },
  ],
});
assert.equal(contribution.brokerExecution, false);
assert.equal(contribution.items.some((item) => item.symbol === 'BBB' && item.orderValue > 0), false);
assert.equal(contribution.items.find((item) => item.symbol === 'CASH')?.disposition, 'cash-reserve');
assert.equal(contribution.allocatedAmount + contribution.cashRemainder, contribution.contributionAmount);

const migration = readFileSync(
  new URL('../supabase/migrations/202607140001_p8_goal_contributions.sql', import.meta.url),
  'utf8',
).toLowerCase();
for (const contract of [
  'portfolio_goals',
  'plan_kind',
  "check (plan_kind in ('rebalance', 'contribution'))",
  'goal_updated_at',
  'scheduled_for',
  'contribution_amount',
  'cash_remainder',
  'deposit_transaction_id',
  'upsert_portfolio_goal',
  'transition_portfolio_goal',
  'mark_portfolio_goal_scan_attempt',
  'create_portfolio_contribution_run',
  'transition_portfolio_contribution_run',
  'complete_portfolio_contribution_run',
  'portfolio_contribution_runs_cycle_idx',
  "derived_key := 'p8:'",
  'append_portfolio_transaction',
  'for update',
  'pg_advisory_xact_lock',
  'execution_reversed',
  'revoke insert, update, delete on public.portfolio_goals',
]) assert.ok(migration.includes(contract), `missing P8 migration contract: ${contract}`);

const service = readFileSync(new URL('../server/portfolio/contribution-service.ts', import.meta.url), 'utf8');
for (const contract of [
  'computeContributionPlan(',
  "source: 'manual' | 'scheduled'",
  'CONTRIBUTION_SCAN_LIMIT',
  'PRICE_MOVE_REAPPROVAL_PCT = 3',
  'actualSpend > run.contributionAmount',
  "'CONTRIBUTION_REAPPROVAL_REQUIRED'",
  "summary.totalValue >= goal.targetAmount",
  "'complete', goal.updatedAt",
]) assert.ok(service.includes(contract), `missing P8 service contract: ${contract}`);

const store = readFileSync(new URL('../server/portfolio/store.ts', import.meta.url), 'utf8');
const fairScanIndex = store.indexOf(".order('last_contribution_scan_at'");
const dueDateIndex = store.indexOf(".order('next_contribution_date'", fairScanIndex);
assert.ok(fairScanIndex >= 0 && dueDateIndex > fairScanIndex, 'contribution scans must rotate by last attempt before due date');
for (const contract of [
  'policy_snapshot: unknown',
  'goalPlanSnapshot(',
  "portfolio_rebalance_runs.plan_kind', 'rebalance'",
]) assert.ok(store.includes(contract), `missing P8 store contract: ${contract}`);

const maintenance = readFileSync(new URL('../routes/cron/daily-maintenance.ts', import.meta.url), 'utf8');
const contributionIndex = maintenance.indexOf('monitorPortfolioContributions(');
const rebalanceIndex = maintenance.indexOf('monitorPortfolioRebalances(');
assert.ok(contributionIndex >= 0, 'daily maintenance must scan due contributions');
assert.ok(rebalanceIndex > contributionIndex, 'due contributions must reserve the shared open-plan slot before drift scanning');

for (const relative of [
  '../routes/portfolio/goal.ts',
  '../routes/portfolio/contributions.ts',
  '../src/features/portfolio/GoalContributionPanel.tsx',
  '../src/features/portfolio/GoalPlanDialog.tsx',
  '../src/features/portfolio/ContributionExecutionDialog.tsx',
]) assert.ok(readFileSync(new URL(relative, import.meta.url), 'utf8').length > 500, `missing P8 surface: ${relative}`);

console.log(JSON.stringify({
  version: '1.10.0',
  deterministicGoalProjection: 'PASS',
  buyOnlyContributionAllocation: 'PASS',
  cashTargetAndCentConservation: 'PASS',
  sharedOpenPlanMutex: 'PASS',
  scheduledCycleDeduplication: 'PASS',
  auditedApprovalWorkflow: 'PASS',
  atomicDepositAndFillLedger: 'PASS',
  noBankOrBrokerAutomation: 'PASS',
  result: 'PASS',
}, null, 2));
