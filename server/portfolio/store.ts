import { getSupabaseAdmin } from '../auth/supabase.js';
import type {
  AiSource,
  DataProvenance,
  InvestmentThesis,
  InvestmentThesisStatus,
  PortfolioAllocationPolicy,
  PortfolioAllocationTarget,
  PortfolioContributionRun,
  PortfolioGoal,
  PortfolioGoalPlanSnapshot,
  PortfolioGoalStatus,
  PortfolioOrderCostBreakdown,
  PortfolioOrderCostPolicy,
  PortfolioOrderOptimizationDecision,
  PortfolioRecord,
  PortfolioRebalanceAuditEntry,
  PortfolioRebalanceExecutionLink,
  PortfolioRebalanceItem,
  PortfolioRebalanceRun,
  PortfolioRebalanceStatus,
  PortfolioSnapshot,
  PortfolioStatus,
  PortfolioSummary,
  PortfolioTaxLotSlice,
  PortfolioTransaction,
  PortfolioTransactionKind,
} from '../../src/shared/api.js';

interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  base_currency: 'USD';
  status: PortfolioStatus;
  created_at: string;
  updated_at: string;
}
interface AllocationPolicyRow {
  portfolio_id: string;
  user_id: string;
  drift_threshold_pct: number | string;
  min_trade_value: number | string;
  rebalance_email_enabled: boolean;
  rebalance_push_enabled: boolean;
  commission_fixed_usd: number | string;
  commission_bps: number | string;
  buy_slippage_bps: number | string;
  sell_slippage_bps: number | string;
  sell_transaction_tax_bps: number | string;
  capital_gains_tax_pct: number | string;
  max_cost_pct: number | string;
  updated_at: string;
}
interface AllocationTargetRow {
  portfolio_id: string;
  user_id: string;
  symbol: string;
  target_pct: number | string;
}
interface RebalanceRunRow {
  id: string;
  portfolio_id: string;
  user_id: string;
  plan_kind: 'rebalance' | 'contribution';
  status: PortfolioRebalanceStatus;
  source: 'manual' | 'scheduled';
  plan_hash: string;
  policy_snapshot: unknown;
  cost_model_version: number | string;
  cost_policy_snapshot: unknown;
  policy_updated_at: string;
  portfolio_updated_at: string;
  valuation_as_of: string;
  valuation_quality: PortfolioSummary['valuationQuality'];
  total_value: number | string;
  cash_balance: number | string;
  drift_threshold_pct: number | string;
  min_trade_value: number | string;
  max_drift_pct: number | string;
  estimated_cash_after: number | string;
  expires_at: string;
  approved_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  expired_at: string | null;
  terminal_reason: string | null;
  goal_id: string | null;
  goal_updated_at: string | null;
  scheduled_for: string | null;
  contribution_amount: number | string | null;
  cash_remainder: number | string | null;
  deposit_transaction_id: string | null;
  created_at: string;
}
interface GoalRow {
  id: string;
  portfolio_id: string;
  user_id: string;
  name: string;
  target_amount: number | string;
  target_date: string;
  expected_annual_return_pct: number | string;
  contribution_amount: number | string;
  contribution_day: number | string;
  next_contribution_date: string;
  status: PortfolioGoalStatus;
  created_at: string;
  updated_at: string;
}
interface RebalanceItemRow {
  id: string;
  run_id: string;
  ordinal: number;
  symbol: string;
  current_value: number | string;
  current_pct: number | string;
  target_value: number | string;
  target_pct: number | string;
  drift_pct: number | string;
  action: PortfolioRebalanceItem['action'];
  trade_value: number | string;
  requested_trade_value: number | string;
  optimization_decision: PortfolioOrderOptimizationDecision;
  estimated_costs: unknown;
  estimated_cost_basis: number | string;
  tax_lot_snapshot: unknown;
  reference_price: number | string | null;
  price_as_of: string | null;
  provenance: DataProvenance | null;
  estimated_quantity: number | string | null;
}
interface RebalanceFillRow {
  item_id: string;
  transaction_id: string;
  actual_quantity: number | string;
  actual_price: number | string;
  actual_fees: number | string;
  actual_costs: unknown;
}
interface RebalanceEventRow {
  id: number | string;
  run_id: string;
  event: PortfolioRebalanceAuditEntry['event'];
  from_status: PortfolioRebalanceStatus | null;
  to_status: PortfolioRebalanceStatus;
  reason: string | null;
  details: Record<string, unknown> | null;
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: string;
}
export interface RebalanceDeliveryRow {
  readonly id: string;
  readonly run_id: string;
  readonly portfolio_id: string;
  readonly user_id: string;
  readonly channel: 'email' | 'push';
  readonly status: 'pending' | 'processing' | 'retry' | 'sent' | 'failed' | 'disabled';
  readonly attempts: number;
  readonly payload: Readonly<{
    runId: string;
    portfolioId: string;
    symbol: string;
    driftPct: number;
    targetPct: number;
    createdAt: string;
  }>;
}
interface SnapshotRow {
  id: number | string;
  portfolio_id: string;
  user_id: string;
  captured_at: string;
  as_of: string;
  total_value: number | string;
  cash_balance: number | string;
  market_value: number | string;
  net_contributions: number | string;
  total_return: number | string;
  valuation_quality: PortfolioSummary['valuationQuality'];
}
interface TransactionRow {
  id: string;
  portfolio_id: string;
  user_id: string;
  kind: PortfolioTransactionKind;
  symbol: string | null;
  quantity: number | string;
  price: number | string;
  cash_amount: number | string;
  fees: number | string;
  trade_at: string;
  note: string | null;
  reversal_of: string | null;
  created_at: string;
}
interface ThesisRow {
  id: string;
  portfolio_id: string | null;
  user_id: string;
  symbol: string;
  title: string;
  thesis: string;
  bull_case: string;
  bear_case: string;
  catalysts: string[] | null;
  invalidation: string;
  target_price: number | string | null;
  confidence: number | string;
  status: InvestmentThesisStatus;
  evidence: AiSource[] | null;
  evidence_hash: string | null;
  created_at: string;
  updated_at: string;
}

function ensure(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}
function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const ZERO_COST_POLICY: PortfolioOrderCostPolicy = Object.freeze({
  commissionFixedUsd: 0,
  commissionBps: 0,
  buySlippageBps: 0,
  sellSlippageBps: 0,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 0,
  maxCostPct: 100,
  taxLotMethod: 'fifo',
});
const ZERO_COSTS: PortfolioOrderCostBreakdown = Object.freeze({
  commission: 0,
  slippage: 0,
  transactionTax: 0,
  capitalGainsTax: 0,
  tax: 0,
  taxableGain: 0,
  total: 0,
  netCashEffect: 0,
});

function orderCostPolicy(value: unknown): PortfolioOrderCostPolicy {
  if (!value || typeof value !== 'object') return ZERO_COST_POLICY;
  const row = value as Record<string, unknown>;
  const parsed = {
    commissionFixedUsd: Number(row.commissionFixedUsd),
    commissionBps: Number(row.commissionBps),
    buySlippageBps: Number(row.buySlippageBps),
    sellSlippageBps: Number(row.sellSlippageBps),
    sellTransactionTaxBps: Number(row.sellTransactionTaxBps),
    capitalGainsTaxPct: Number(row.capitalGainsTaxPct),
    maxCostPct: Number(row.maxCostPct),
  };
  if (Object.values(parsed).some((entry) => !Number.isFinite(entry) || entry < 0)
    || parsed.commissionFixedUsd > 1_000_000_000
    || parsed.commissionBps > 10_000
    || parsed.buySlippageBps > 10_000
    || parsed.sellSlippageBps > 10_000
    || parsed.sellTransactionTaxBps > 10_000
    || parsed.capitalGainsTaxPct > 100
    || parsed.maxCostPct > 100
    || row.taxLotMethod !== 'fifo') {
    throw new Error('portfolio_order_cost_policy.select: invalid stored snapshot');
  }
  return Object.freeze({ ...parsed, taxLotMethod: 'fifo' });
}

function orderCosts(value: unknown, fallback = ZERO_COSTS): PortfolioOrderCostBreakdown {
  if (!value || typeof value !== 'object') return fallback;
  const row = value as Record<string, unknown>;
  const parsed: PortfolioOrderCostBreakdown = {
    commission: Number(row.commission),
    slippage: Number(row.slippage),
    transactionTax: Number(row.transactionTax),
    capitalGainsTax: Number(row.capitalGainsTax),
    tax: Number(row.tax),
    taxableGain: Number(row.taxableGain),
    total: Number(row.total),
    netCashEffect: Number(row.netCashEffect),
  };
  if (Object.values(parsed).some((entry) => !Number.isFinite(entry))
    || parsed.commission < 0 || parsed.transactionTax < 0 || parsed.capitalGainsTax < 0
    || parsed.tax < 0 || parsed.taxableGain < 0) {
    throw new Error('portfolio_order_costs.select: invalid stored breakdown');
  }
  return Object.freeze(parsed);
}

function sumOrderCosts(values: readonly PortfolioOrderCostBreakdown[]): PortfolioOrderCostBreakdown {
  const sum = (key: keyof PortfolioOrderCostBreakdown) => Math.round(
    values.reduce((total, value) => total + value[key], 0) * 100_000_000,
  ) / 100_000_000;
  return Object.freeze({
    commission: sum('commission'),
    slippage: sum('slippage'),
    transactionTax: sum('transactionTax'),
    capitalGainsTax: sum('capitalGainsTax'),
    tax: sum('tax'),
    taxableGain: sum('taxableGain'),
    total: sum('total'),
    netCashEffect: sum('netCashEffect'),
  });
}

function taxLotSnapshot(value: unknown): readonly PortfolioTaxLotSlice[] {
  if (value === null || value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error('portfolio_tax_lot_snapshot.select: invalid stored snapshot');
  return Object.freeze(value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('portfolio_tax_lot_snapshot.select: invalid lot');
    const row = entry as Record<string, unknown>;
    const transactionId = typeof row.transactionId === 'string' ? row.transactionId : '';
    const acquiredAt = typeof row.acquiredAt === 'string' ? row.acquiredAt : '';
    const quantity = Number(row.quantity);
    const unitCost = Number(row.unitCost);
    const costBasis = Number(row.costBasis);
    if (!transactionId || !acquiredAt || Number.isNaN(Date.parse(acquiredAt))
      || !Number.isFinite(quantity) || quantity <= 0
      || !Number.isFinite(unitCost) || unitCost < 0
      || !Number.isFinite(costBasis) || costBasis < 0) {
      throw new Error('portfolio_tax_lot_snapshot.select: invalid lot');
    }
    return Object.freeze({ transactionId, acquiredAt, quantity, unitCost, costBasis });
  }));
}

function goalPlanSnapshot(value: unknown): PortfolioGoalPlanSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>).goal;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const row = candidate as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const name = typeof row.name === 'string' ? row.name : '';
  const targetDate = typeof row.targetDate === 'string' ? row.targetDate : '';
  const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : '';
  const targetAmount = Number(row.targetAmount);
  const expectedAnnualReturnPct = Number(row.expectedAnnualReturnPct);
  const contributionAmount = Number(row.contributionAmount);
  const contributionDay = Number(row.contributionDay);
  if (!id || !name || !targetDate || !updatedAt
    || !Number.isFinite(targetAmount) || targetAmount <= 0
    || !Number.isFinite(expectedAnnualReturnPct)
    || !Number.isFinite(contributionAmount) || contributionAmount <= 0
    || !Number.isInteger(contributionDay) || contributionDay < 1 || contributionDay > 28) {
    return undefined;
  }
  return Object.freeze({
    id,
    name,
    targetAmount,
    targetDate,
    expectedAnnualReturnPct,
    contributionAmount,
    contributionDay,
    updatedAt,
  });
}
function portfolio(row: PortfolioRow): PortfolioRecord {
  return Object.freeze({
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
function goal(row: GoalRow): PortfolioGoal {
  return Object.freeze({
    id: row.id,
    portfolioId: row.portfolio_id,
    name: row.name,
    targetAmount: numeric(row.target_amount),
    targetDate: row.target_date,
    expectedAnnualReturnPct: numeric(row.expected_annual_return_pct),
    contributionAmount: numeric(row.contribution_amount),
    contributionDay: numeric(row.contribution_day),
    nextContributionDate: row.next_contribution_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
function snapshot(row: SnapshotRow): PortfolioSnapshot {
  return Object.freeze({
    id: String(row.id),
    portfolioId: row.portfolio_id,
    capturedAt: row.captured_at,
    asOfISO: row.as_of,
    totalValue: numeric(row.total_value),
    cashBalance: numeric(row.cash_balance),
    marketValue: numeric(row.market_value),
    netContributions: numeric(row.net_contributions),
    totalReturn: numeric(row.total_return),
    valuationQuality: row.valuation_quality,
  });
}
function transaction(row: TransactionRow): PortfolioTransaction {
  return Object.freeze({
    id: row.id,
    portfolioId: row.portfolio_id,
    kind: row.kind,
    ...(row.symbol ? { symbol: row.symbol } : {}),
    quantity: numeric(row.quantity),
    price: numeric(row.price),
    cashAmount: numeric(row.cash_amount),
    fees: numeric(row.fees),
    tradeAt: row.trade_at,
    ...(row.note ? { note: row.note } : {}),
    ...(row.reversal_of ? { reversalOf: row.reversal_of } : {}),
    createdAt: row.created_at,
  });
}
function thesis(row: ThesisRow): InvestmentThesis {
  return Object.freeze({
    id: row.id,
    ...(row.portfolio_id ? { portfolioId: row.portfolio_id } : {}),
    symbol: row.symbol,
    title: row.title,
    thesis: row.thesis,
    bullCase: row.bull_case,
    bearCase: row.bear_case,
    catalysts: Object.freeze([...(row.catalysts ?? [])]),
    invalidation: row.invalidation,
    ...(row.target_price === null ? {} : { targetPrice: numeric(row.target_price) }),
    confidence: numeric(row.confidence),
    status: row.status,
    evidence: Object.freeze([...(row.evidence ?? [])]),
    ...(row.evidence_hash ? { evidenceHash: row.evidence_hash } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listPortfolios(userId: string, includeArchived = false): Promise<readonly PortfolioRecord[]> {
  let query = getSupabaseAdmin().from('portfolios').select('*').eq('user_id', userId);
  if (!includeArchived) query = query.eq('status', 'active');
  const { data, error } = await query.order('created_at', { ascending: true });
  ensure(error, 'portfolios.select');
  return Object.freeze(((data ?? []) as PortfolioRow[]).map(portfolio));
}

export async function getPortfolio(userId: string, portfolioId: string): Promise<PortfolioRecord | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolios').select('*')
    .eq('id', portfolioId).eq('user_id', userId).maybeSingle();
  ensure(error, 'portfolio.select');
  return data ? portfolio(data as PortfolioRow) : null;
}

export async function countActivePortfolios(userId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('portfolios')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'active');
  ensure(error, 'portfolios.count');
  return count ?? 0;
}

export async function createPortfolio(userId: string, name: string): Promise<PortfolioRecord> {
  const { data, error } = await getSupabaseAdmin().from('portfolios').insert({
    user_id: userId,
    name,
    base_currency: 'USD',
    status: 'active',
  }).select('*').single();
  ensure(error, 'portfolio.insert');
  return portfolio(data as PortfolioRow);
}

export async function updatePortfolio(
  userId: string,
  portfolioId: string,
  patch: Readonly<{ name?: string; status?: PortfolioStatus }>,
): Promise<PortfolioRecord> {
  const { data, error } = await getSupabaseAdmin().from('portfolios').update({
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.status ? { status: patch.status } : {}),
  }).eq('id', portfolioId).eq('user_id', userId).select('*').single();
  ensure(error, 'portfolio.update');
  return portfolio(data as PortfolioRow);
}

export async function getPortfolioAllocationPolicy(
  userId: string,
  portfolioId: string,
): Promise<PortfolioAllocationPolicy | null> {
  const admin = getSupabaseAdmin();
  const { data: policyData, error: policyError } = await admin.from('portfolio_allocation_policies').select('*')
    .eq('portfolio_id', portfolioId).eq('user_id', userId).maybeSingle();
  ensure(policyError, 'portfolio_allocation_policy.select');
  if (!policyData) return null;
  const { data: targetData, error: targetError } = await admin.from('portfolio_allocation_targets').select('*')
    .eq('portfolio_id', portfolioId).eq('user_id', userId).order('symbol', { ascending: true });
  ensure(targetError, 'portfolio_allocation_targets.select');
  const policy = policyData as AllocationPolicyRow;
  const targets: readonly PortfolioAllocationTarget[] = Object.freeze(((targetData ?? []) as AllocationTargetRow[]).map((row) => Object.freeze({
    symbol: row.symbol,
    targetPct: numeric(row.target_pct),
  })));
  return Object.freeze({
    portfolioId: policy.portfolio_id,
    driftThresholdPct: numeric(policy.drift_threshold_pct),
    minTradeValue: numeric(policy.min_trade_value),
    emailEnabled: policy.rebalance_email_enabled,
    pushEnabled: policy.rebalance_push_enabled,
    costPolicy: Object.freeze({
      commissionFixedUsd: numeric(policy.commission_fixed_usd),
      commissionBps: numeric(policy.commission_bps),
      buySlippageBps: numeric(policy.buy_slippage_bps),
      sellSlippageBps: numeric(policy.sell_slippage_bps),
      sellTransactionTaxBps: numeric(policy.sell_transaction_tax_bps),
      capitalGainsTaxPct: numeric(policy.capital_gains_tax_pct),
      maxCostPct: numeric(policy.max_cost_pct),
      taxLotMethod: 'fifo',
    }),
    targets,
    updatedAt: policy.updated_at,
  });
}

export async function replacePortfolioAllocationPolicy(
  userId: string,
  portfolioId: string,
  input: Readonly<{
    driftThresholdPct: number;
    minTradeValue: number;
    emailEnabled: boolean;
    pushEnabled: boolean;
    costPolicy: PortfolioOrderCostPolicy;
    targets: readonly PortfolioAllocationTarget[];
  }>,
): Promise<PortfolioAllocationPolicy> {
  const { error } = await getSupabaseAdmin().rpc('replace_portfolio_allocation_policy_p9', {
    p_user_id: userId,
    p_portfolio_id: portfolioId,
    p_drift_threshold_pct: input.driftThresholdPct,
    p_min_trade_value: input.minTradeValue,
    p_rebalance_email_enabled: input.emailEnabled,
    p_rebalance_push_enabled: input.pushEnabled,
    p_commission_fixed_usd: input.costPolicy.commissionFixedUsd,
    p_commission_bps: input.costPolicy.commissionBps,
    p_buy_slippage_bps: input.costPolicy.buySlippageBps,
    p_sell_slippage_bps: input.costPolicy.sellSlippageBps,
    p_sell_transaction_tax_bps: input.costPolicy.sellTransactionTaxBps,
    p_capital_gains_tax_pct: input.costPolicy.capitalGainsTaxPct,
    p_max_cost_pct: input.costPolicy.maxCostPct,
    p_targets: input.targets,
  });
  ensure(error, 'portfolio_allocation_policy.replace');
  const policy = await getPortfolioAllocationPolicy(userId, portfolioId);
  if (!policy) throw new Error('portfolio_allocation_policy.replace: saved policy was not found');
  return policy;
}

export async function getPortfolioGoal(
  userId: string,
  portfolioId: string,
): Promise<PortfolioGoal | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_goals').select('*')
    .eq('portfolio_id', portfolioId).eq('user_id', userId)
    .in('status', ['active', 'paused', 'completed']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  ensure(error, 'portfolio_goal.select');
  return data ? goal(data as GoalRow) : null;
}

export async function getPortfolioGoalById(userId: string, goalId: string): Promise<PortfolioGoal | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_goals').select('*')
    .eq('id', goalId).eq('user_id', userId).maybeSingle();
  ensure(error, 'portfolio_goal.select_by_id');
  return data ? goal(data as GoalRow) : null;
}

export interface SavePortfolioGoalInput {
  readonly portfolioId: string;
  readonly name: string;
  readonly targetAmount: number;
  readonly targetDate: string;
  readonly expectedAnnualReturnPct: number;
  readonly contributionAmount: number;
  readonly contributionDay: number;
  readonly expectedUpdatedAt?: string;
}

export async function savePortfolioGoal(
  userId: string,
  input: SavePortfolioGoalInput,
): Promise<PortfolioGoal> {
  const { data, error } = await getSupabaseAdmin().rpc('upsert_portfolio_goal', {
    p_user_id: userId,
    p_portfolio_id: input.portfolioId,
    p_name: input.name,
    p_target_amount: input.targetAmount,
    p_target_date: input.targetDate,
    p_expected_annual_return_pct: input.expectedAnnualReturnPct,
    p_contribution_amount: input.contributionAmount,
    p_contribution_day: input.contributionDay,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  ensure(error, 'portfolio_goal.upsert');
  const goalId = String(data ?? '');
  const { data: saved, error: selectError } = await getSupabaseAdmin().from('portfolio_goals').select('*')
    .eq('id', goalId).eq('user_id', userId).single();
  ensure(selectError, 'portfolio_goal.upsert.select');
  return goal(saved as GoalRow);
}

export async function transitionPortfolioGoal(
  userId: string,
  goalId: string,
  action: 'pause' | 'resume' | 'archive' | 'complete',
  expectedUpdatedAt: string,
): Promise<PortfolioGoal> {
  const { data, error } = await getSupabaseAdmin().rpc('transition_portfolio_goal', {
    p_user_id: userId,
    p_goal_id: goalId,
    p_action: action,
    p_expected_updated_at: expectedUpdatedAt,
  });
  ensure(error, 'portfolio_goal.transition');
  const updatedId = String(data ?? goalId);
  const { data: saved, error: selectError } = await getSupabaseAdmin().from('portfolio_goals').select('*')
    .eq('id', updatedId).eq('user_id', userId).single();
  ensure(selectError, 'portfolio_goal.transition.select');
  return goal(saved as GoalRow);
}

function rebalanceItem(
  row: RebalanceItemRow,
  fill?: RebalanceFillRow,
  costModelVersion: 0 | 1 = 1,
): PortfolioRebalanceItem {
  const tradeValue = numeric(row.trade_value);
  const actualQuantity = fill ? numeric(fill.actual_quantity) : undefined;
  const actualPrice = fill ? numeric(fill.actual_price) : undefined;
  const actualFees = fill ? numeric(fill.actual_fees) : undefined;
  const actualNotional = actualQuantity === undefined || actualPrice === undefined
    ? 0
    : actualQuantity * actualPrice;
  const legacyActualCosts: PortfolioOrderCostBreakdown | undefined = fill && actualFees !== undefined
    ? Object.freeze({
      ...ZERO_COSTS,
      commission: actualFees,
      total: actualFees,
      netCashEffect: row.action === 'buy'
        ? -(actualNotional + actualFees)
        : row.action === 'sell'
          ? actualNotional - actualFees
          : 0,
    })
    : undefined;
  return Object.freeze({
    id: row.id,
    runId: row.run_id,
    symbol: row.symbol,
    currentValue: numeric(row.current_value),
    currentPct: numeric(row.current_pct),
    targetValue: numeric(row.target_value),
    targetPct: numeric(row.target_pct),
    driftPct: numeric(row.drift_pct),
    action: row.action,
    requestedTradeValue: numeric(row.requested_trade_value ?? tradeValue),
    tradeValue,
    optimizationDecision: row.optimization_decision
      ?? (row.action === 'hold' ? 'not-required' : 'execute'),
    estimatedCosts: orderCosts(row.estimated_costs),
    estimatedCostBasis: numeric(row.estimated_cost_basis),
    taxLotSnapshot: taxLotSnapshot(row.tax_lot_snapshot),
    ...(row.reference_price === null ? {} : { referencePrice: numeric(row.reference_price) }),
    ...(row.price_as_of ? { priceAsOf: row.price_as_of } : {}),
    ...(row.provenance ? { provenance: Object.freeze(row.provenance) } : {}),
    ...(row.estimated_quantity === null ? {} : { estimatedQuantity: numeric(row.estimated_quantity) }),
    ...(fill ? {
      transactionId: fill.transaction_id,
      actualQuantity,
      actualPrice,
      actualFees,
      actualCosts: costModelVersion === 0
        ? legacyActualCosts ?? ZERO_COSTS
        : orderCosts(fill.actual_costs, legacyActualCosts ?? ZERO_COSTS),
    } : {}),
  });
}

function rebalanceAudit(row: RebalanceEventRow): PortfolioRebalanceAuditEntry {
  return Object.freeze({
    id: String(row.id),
    runId: row.run_id,
    event: row.event,
    ...(row.from_status ? { fromStatus: row.from_status } : {}),
    toStatus: row.to_status,
    ...(row.reason ? { reason: row.reason } : {}),
    details: Object.freeze({ ...(row.details ?? {}) }),
    createdAt: row.created_at,
  });
}

async function hydrateRebalanceRuns(rows: readonly RebalanceRunRow[]): Promise<readonly PortfolioRebalanceRun[]> {
  if (!rows.length) return Object.freeze([]);
  const admin = getSupabaseAdmin();
  const runIds = rows.map((row) => row.id);
  const [itemResult, fillResult, eventResult] = await Promise.all([
    admin.from('portfolio_rebalance_items').select('*').in('run_id', runIds).order('ordinal', { ascending: true }),
    admin.from('portfolio_rebalance_fills').select('*').in('run_id', runIds),
    admin.from('portfolio_rebalance_events').select('*').in('run_id', runIds)
      .order('created_at', { ascending: true }).order('id', { ascending: true }),
  ]);
  ensure(itemResult.error, 'portfolio_rebalance_items.select');
  ensure(fillResult.error, 'portfolio_rebalance_fills.select');
  ensure(eventResult.error, 'portfolio_rebalance_events.select');
  const fills = new Map(((fillResult.data ?? []) as RebalanceFillRow[]).map((row) => [row.item_id, row]));
  const items = (itemResult.data ?? []) as RebalanceItemRow[];
  const events = (eventResult.data ?? []) as RebalanceEventRow[];
  return Object.freeze(rows.map((row): PortfolioRebalanceRun => {
    const costModelVersion = numeric(row.cost_model_version);
    if (costModelVersion !== 0 && costModelVersion !== 1) {
      throw new Error('portfolio_rebalance_runs.select: unsupported cost model version');
    }
    const goalSnapshot = goalPlanSnapshot(row.policy_snapshot);
    const runItems = Object.freeze(items
      .filter((item) => item.run_id === row.id)
      .map((item) => rebalanceItem(item, fills.get(item.id), costModelVersion)));
    const estimatedCosts = sumOrderCosts(runItems.map((item) => item.estimatedCosts));
    const actualBreakdowns = runItems.flatMap((item) => item.actualCosts ? [item.actualCosts] : []);
    const actualCosts = actualBreakdowns.length > 0 ? sumOrderCosts(actualBreakdowns) : undefined;
    return Object.freeze({
    id: row.id,
    portfolioId: row.portfolio_id,
    planKind: row.plan_kind,
    status: row.status,
    source: row.source,
    planHash: row.plan_hash,
    policyUpdatedAt: row.policy_updated_at,
    portfolioUpdatedAt: row.portfolio_updated_at,
    valuationAsOf: row.valuation_as_of,
    valuationQuality: row.valuation_quality,
    totalValue: numeric(row.total_value),
    cashBalance: numeric(row.cash_balance),
    driftThresholdPct: numeric(row.drift_threshold_pct),
    minTradeValue: numeric(row.min_trade_value),
    maxDriftPct: numeric(row.max_drift_pct),
    estimatedCashAfter: numeric(row.estimated_cash_after),
    costModelVersion,
    costPolicySnapshot: orderCostPolicy(row.cost_policy_snapshot),
    estimatedCosts,
    ...(actualCosts ? { actualCosts } : {}),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.rejected_at ? { rejectedAt: row.rejected_at } : {}),
    ...(row.expired_at ? { expiredAt: row.expired_at } : {}),
    ...(row.terminal_reason ? { terminalReason: row.terminal_reason } : {}),
    ...(goalSnapshot ? { goalSnapshot } : {}),
    ...(row.goal_id ? { goalId: row.goal_id } : {}),
    ...(row.goal_updated_at ? { goalUpdatedAt: row.goal_updated_at } : {}),
    ...(row.scheduled_for ? { scheduledFor: row.scheduled_for } : {}),
    ...(row.contribution_amount === null ? {} : { contributionAmount: numeric(row.contribution_amount) }),
    ...(row.cash_remainder === null ? {} : { cashRemainder: numeric(row.cash_remainder) }),
    ...(row.deposit_transaction_id ? { depositTransactionId: row.deposit_transaction_id } : {}),
    items: runItems,
    audit: Object.freeze(events.filter((event) => event.run_id === row.id).map(rebalanceAudit)),
    });
  }));
}

export async function listPortfolioRebalanceRuns(
  userId: string,
  portfolioId: string,
  limit = 20,
): Promise<readonly PortfolioRebalanceRun[]> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_runs').select('*')
    .eq('user_id', userId).eq('portfolio_id', portfolioId).eq('plan_kind', 'rebalance')
    .order('created_at', { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  ensure(error, 'portfolio_rebalance_runs.select');
  return hydrateRebalanceRuns((data ?? []) as RebalanceRunRow[]);
}

export async function getPortfolioRebalanceRun(
  userId: string,
  runId: string,
): Promise<PortfolioRebalanceRun | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_runs').select('*')
    .eq('user_id', userId).eq('id', runId).eq('plan_kind', 'rebalance').maybeSingle();
  ensure(error, 'portfolio_rebalance_run.select');
  if (!data) return null;
  return (await hydrateRebalanceRuns([data as RebalanceRunRow]))[0] ?? null;
}

function contributionRun(run: PortfolioRebalanceRun): PortfolioContributionRun {
  if (run.planKind !== 'contribution' || !run.goalId || !run.goalUpdatedAt
    || !run.goalSnapshot || run.contributionAmount === undefined || run.cashRemainder === undefined) {
    throw new Error('portfolio_contribution_run.select: incomplete contribution snapshot');
  }
  return run as PortfolioContributionRun;
}

export async function listPortfolioContributionRuns(
  userId: string,
  portfolioId: string,
  limit = 20,
): Promise<readonly PortfolioContributionRun[]> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_runs').select('*')
    .eq('user_id', userId).eq('portfolio_id', portfolioId).eq('plan_kind', 'contribution')
    .order('created_at', { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  ensure(error, 'portfolio_contribution_runs.select');
  return Object.freeze((await hydrateRebalanceRuns((data ?? []) as RebalanceRunRow[])).map(contributionRun));
}

export async function getPortfolioContributionRun(
  userId: string,
  runId: string,
): Promise<PortfolioContributionRun | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_runs').select('*')
    .eq('user_id', userId).eq('id', runId).eq('plan_kind', 'contribution').maybeSingle();
  ensure(error, 'portfolio_contribution_run.select');
  if (!data) return null;
  const hydrated = (await hydrateRebalanceRuns([data as RebalanceRunRow]))[0];
  return hydrated ? contributionRun(hydrated) : null;
}

export async function findContributionIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<Readonly<{
  run: PortfolioContributionRun;
  event: PortfolioRebalanceAuditEntry['event'];
  requestHash?: string;
}> | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_events')
    .select('run_id,event,request_hash,portfolio_rebalance_runs!inner(plan_kind)')
    .eq('user_id', userId).eq('idempotency_key', idempotencyKey)
    .eq('portfolio_rebalance_runs.plan_kind', 'contribution').maybeSingle();
  ensure(error, 'portfolio_contribution_events.idempotency');
  if (!data) return null;
  const row = data as Pick<RebalanceEventRow, 'run_id' | 'event' | 'request_hash'>;
  const run = await getPortfolioContributionRun(userId, row.run_id);
  if (!run) throw new Error('portfolio_contribution_events.idempotency: linked run was not found');
  return Object.freeze({
    run,
    event: row.event,
    ...(row.request_hash ? { requestHash: row.request_hash } : {}),
  });
}

export async function findRebalanceIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<Readonly<{
  run: PortfolioRebalanceRun;
  event: PortfolioRebalanceAuditEntry['event'];
  requestHash?: string;
}> | null> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_rebalance_events')
    .select('run_id,event,request_hash,portfolio_rebalance_runs!inner(plan_kind)')
    .eq('user_id', userId).eq('idempotency_key', idempotencyKey)
    .eq('portfolio_rebalance_runs.plan_kind', 'rebalance').maybeSingle();
  ensure(error, 'portfolio_rebalance_events.idempotency');
  if (!data) return null;
  const row = data as Pick<RebalanceEventRow, 'run_id' | 'event' | 'request_hash'>;
  const run = await getPortfolioRebalanceRun(userId, row.run_id);
  if (!run) throw new Error('portfolio_rebalance_events.idempotency: linked run was not found');
  return Object.freeze({
    run,
    event: row.event,
    ...(row.request_hash ? { requestHash: row.request_hash } : {}),
  });
}

export interface CreateRebalanceRunInput {
  readonly portfolioId: string;
  readonly source: 'manual' | 'scheduled';
  readonly planHash: string;
  readonly policyUpdatedAt: string;
  readonly portfolioUpdatedAt: string;
  readonly valuationAsOf: string;
  readonly valuationQuality: PortfolioSummary['valuationQuality'];
  readonly totalValue: number;
  readonly cashBalance: number;
  readonly driftThresholdPct: number;
  readonly minTradeValue: number;
  readonly maxDriftPct: number;
  readonly estimatedCashAfter: number;
  readonly expiresAt: string;
  readonly items: readonly Readonly<{
    symbol: string;
    currentQuantity: number;
    currentValue: number;
    currentPct: number;
    targetValue: number;
    targetPct: number;
    driftPct: number;
    action: PortfolioRebalanceItem['action'];
    requestedTradeValue: number;
    tradeValue: number;
    optimizationDecision: PortfolioOrderOptimizationDecision;
    estimatedCosts: PortfolioOrderCostBreakdown;
    estimatedCostBasis: number;
    taxLotSnapshot: readonly PortfolioTaxLotSlice[];
    referencePrice?: number;
    priceAsOf?: string;
    provenance?: DataProvenance;
    estimatedQuantity?: number;
  }>[];
}

export interface PortfolioComputedExecutionLink extends PortfolioRebalanceExecutionLink {
  readonly actualCosts: PortfolioOrderCostBreakdown;
}

export async function createPortfolioRebalanceRun(
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  input: CreateRebalanceRunInput,
): Promise<Readonly<{ run: PortfolioRebalanceRun; created: boolean }>> {
  const { data, error } = await getSupabaseAdmin().rpc('create_portfolio_rebalance_run', {
    p_user_id: userId,
    p_portfolio_id: input.portfolioId,
    p_source: input.source,
    p_plan_hash: input.planHash,
    p_policy_updated_at: input.policyUpdatedAt,
    p_portfolio_updated_at: input.portfolioUpdatedAt,
    p_valuation_as_of: input.valuationAsOf,
    p_valuation_quality: input.valuationQuality,
    p_total_value: input.totalValue,
    p_cash_balance: input.cashBalance,
    p_drift_threshold_pct: input.driftThresholdPct,
    p_min_trade_value: input.minTradeValue,
    p_max_drift_pct: input.maxDriftPct,
    p_estimated_cash_after: input.estimatedCashAfter,
    p_expires_at: input.expiresAt,
    p_items: input.items,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_rebalance_run.create');
  const result = data as { runId?: string; created?: boolean } | null;
  if (!result?.runId) throw new Error('portfolio_rebalance_run.create: empty response');
  const run = await getPortfolioRebalanceRun(userId, result.runId);
  if (!run) throw new Error('portfolio_rebalance_run.create: created run was not found');
  return Object.freeze({ run, created: result.created === true });
}

export async function transitionPortfolioRebalanceRun(
  userId: string,
  runId: string,
  action: 'approved' | 'rejected' | 'expired',
  reason: string | undefined,
  details: Readonly<Record<string, unknown>> | undefined,
  idempotencyKey: string,
  requestHash: string,
): Promise<PortfolioRebalanceRun> {
  const { data, error } = await getSupabaseAdmin().rpc('transition_portfolio_rebalance_run', {
    p_user_id: userId,
    p_run_id: runId,
    p_action: action,
    p_reason: reason ?? null,
    p_details: details ?? {},
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_rebalance_run.transition');
  const updated = await getPortfolioRebalanceRun(userId, String(data ?? runId));
  if (!updated) throw new Error('portfolio_rebalance_run.transition: updated run was not found');
  return updated;
}

export async function completePortfolioRebalanceRun(
  userId: string,
  runId: string,
  fills: readonly PortfolioComputedExecutionLink[],
  idempotencyKey: string,
  requestHash: string,
): Promise<PortfolioRebalanceRun> {
  const { data, error } = await getSupabaseAdmin().rpc('complete_portfolio_rebalance_run', {
    p_user_id: userId,
    p_run_id: runId,
    p_fills: fills.map((fill) => ({
      itemId: fill.itemId,
      quantity: fill.quantity,
      price: fill.price,
      fees: fill.fees,
      tradeAt: fill.tradeAt,
      actualCosts: fill.actualCosts,
    })),
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_rebalance_run.complete');
  const updated = await getPortfolioRebalanceRun(userId, String(data ?? runId));
  if (!updated) throw new Error('portfolio_rebalance_run.complete: updated run was not found');
  return updated;
}

export interface CreateContributionRunInput {
  readonly portfolioId: string;
  readonly goalId: string;
  readonly source: 'manual' | 'scheduled';
  readonly scheduledFor?: string;
  readonly planHash: string;
  readonly goalUpdatedAt: string;
  readonly policyUpdatedAt: string;
  readonly portfolioUpdatedAt: string;
  readonly valuationAsOf: string;
  readonly valuationQuality: PortfolioSummary['valuationQuality'];
  readonly totalValue: number;
  readonly cashBalance: number;
  readonly contributionAmount: number;
  readonly minTradeValue: number;
  readonly maxDriftPct: number;
  readonly cashRemainder: number;
  readonly estimatedCashAfter: number;
  readonly expiresAt: string;
  readonly items: CreateRebalanceRunInput['items'];
}

export async function createPortfolioContributionRun(
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  input: CreateContributionRunInput,
): Promise<Readonly<{ run: PortfolioContributionRun; created: boolean }>> {
  const { data, error } = await getSupabaseAdmin().rpc('create_portfolio_contribution_run', {
    p_user_id: userId,
    p_portfolio_id: input.portfolioId,
    p_goal_id: input.goalId,
    p_source: input.source,
    p_scheduled_for: input.scheduledFor ?? null,
    p_plan_hash: input.planHash,
    p_goal_updated_at: input.goalUpdatedAt,
    p_policy_updated_at: input.policyUpdatedAt,
    p_portfolio_updated_at: input.portfolioUpdatedAt,
    p_valuation_as_of: input.valuationAsOf,
    p_valuation_quality: input.valuationQuality,
    p_total_value: input.totalValue,
    p_cash_balance: input.cashBalance,
    p_contribution_amount: input.contributionAmount,
    p_min_trade_value: input.minTradeValue,
    p_max_drift_pct: input.maxDriftPct,
    p_cash_remainder: input.cashRemainder,
    p_estimated_cash_after: input.estimatedCashAfter,
    p_expires_at: input.expiresAt,
    p_items: input.items,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_contribution_run.create');
  const result = data as { runId?: string; created?: boolean } | null;
  if (!result?.runId) throw new Error('portfolio_contribution_run.create: empty response');
  const run = await getPortfolioContributionRun(userId, result.runId);
  if (!run) throw new Error('portfolio_contribution_run.create: created run was not found');
  return Object.freeze({ run, created: result.created === true });
}

export async function transitionPortfolioContributionRun(
  userId: string,
  runId: string,
  action: 'approved' | 'rejected' | 'expired',
  reason: string | undefined,
  details: Readonly<Record<string, unknown>> | undefined,
  idempotencyKey: string,
  requestHash: string,
): Promise<PortfolioContributionRun> {
  const { data, error } = await getSupabaseAdmin().rpc('transition_portfolio_contribution_run', {
    p_user_id: userId,
    p_run_id: runId,
    p_action: action,
    p_reason: reason ?? null,
    p_details: details ?? {},
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_contribution_run.transition');
  const updated = await getPortfolioContributionRun(userId, String(data ?? runId));
  if (!updated) throw new Error('portfolio_contribution_run.transition: updated run was not found');
  return updated;
}

export async function completePortfolioContributionRun(
  userId: string,
  runId: string,
  depositAt: string,
  fills: readonly PortfolioComputedExecutionLink[],
  idempotencyKey: string,
  requestHash: string,
): Promise<PortfolioContributionRun> {
  const { data, error } = await getSupabaseAdmin().rpc('complete_portfolio_contribution_run', {
    p_user_id: userId,
    p_run_id: runId,
    p_deposit_at: depositAt,
    p_fills: fills.map((fill) => ({
      itemId: fill.itemId,
      quantity: fill.quantity,
      price: fill.price,
      fees: fill.fees,
      tradeAt: fill.tradeAt,
      actualCosts: fill.actualCosts,
    })),
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  ensure(error, 'portfolio_contribution_run.complete');
  const updated = await getPortfolioContributionRun(userId, String(data ?? runId));
  if (!updated) throw new Error('portfolio_contribution_run.complete: updated run was not found');
  return updated;
}

export interface ContributionScanTarget {
  readonly goalId: string;
  readonly portfolioId: string;
  readonly userId: string;
  readonly nextContributionDate: string;
}

export async function listContributionScanTargets(limit: number): Promise<readonly ContributionScanTarget[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin().from('portfolio_goals')
    .select('id,portfolio_id,user_id,next_contribution_date,portfolios!inner(status)')
    .eq('status', 'active').eq('portfolios.status', 'active')
    .gte('target_date', today).lte('next_contribution_date', today)
    .order('last_contribution_scan_at', { ascending: true, nullsFirst: true })
    .order('next_contribution_date', { ascending: true })
    .order('id', { ascending: true }).limit(Math.max(1, Math.min(limit, 50)));
  ensure(error, 'portfolio_contribution_scan.targets');
  return Object.freeze(((data ?? []) as Array<{
    id: string;
    portfolio_id: string;
    user_id: string;
    next_contribution_date: string;
  }>).map((row) => Object.freeze({
    goalId: row.id,
    portfolioId: row.portfolio_id,
    userId: row.user_id,
    nextContributionDate: row.next_contribution_date,
  })));
}

export async function markContributionScanAttempt(userId: string, goalId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('mark_portfolio_goal_scan_attempt', {
    p_user_id: userId,
    p_goal_id: goalId,
  });
  ensure(error, 'portfolio_contribution_scan.mark_attempt');
}

export interface RebalanceScanTarget {
  readonly portfolioId: string;
  readonly userId: string;
}

export async function listRebalanceScanTargets(limit: number): Promise<readonly RebalanceScanTarget[]> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_allocation_policies')
    .select('portfolio_id,user_id,portfolios!inner(status)').eq('portfolios.status', 'active')
    .order('last_rebalance_scan_at', { ascending: true, nullsFirst: true })
    .order('portfolio_id', { ascending: true }).limit(Math.max(1, Math.min(limit, 100)));
  ensure(error, 'portfolio_rebalance_scan.targets');
  return Object.freeze(((data ?? []) as Array<{ portfolio_id: string; user_id: string }>).map((row) => Object.freeze({
    portfolioId: row.portfolio_id,
    userId: row.user_id,
  })));
}

export async function markRebalanceScanAttempt(userId: string, portfolioId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('mark_portfolio_rebalance_scan_attempt', {
    p_user_id: userId,
    p_portfolio_id: portfolioId,
  });
  ensure(error, 'portfolio_rebalance_scan.mark_attempt');
}

export async function expirePortfolioRebalanceRuns(limit = 250): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc('expire_portfolio_rebalance_runs', { p_limit: limit });
  ensure(error, 'portfolio_rebalance_runs.expire');
  return numeric(data as number | string | null);
}

export async function claimDueRebalanceDeliveries(limit: number): Promise<readonly RebalanceDeliveryRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_due_portfolio_rebalance_deliveries', { p_limit: limit });
  ensure(error, 'portfolio_rebalance_deliveries.claim');
  return Object.freeze([...(data ?? [])] as RebalanceDeliveryRow[]);
}

export async function markRebalanceDeliverySent(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('portfolio_rebalance_deliveries').update({
    status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'processing');
  ensure(error, 'portfolio_rebalance_deliveries.sent');
}

export async function markRebalanceDeliveryDisabled(id: string, reason: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('portfolio_rebalance_deliveries').update({
    status: 'disabled', last_error: reason.slice(0, 1000), updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'processing');
  ensure(error, 'portfolio_rebalance_deliveries.disabled');
}

export async function markRebalanceDeliveryFailure(
  id: string,
  attempts: number,
  message: string,
  nextAttemptAt: string | null,
): Promise<void> {
  const { error } = await getSupabaseAdmin().from('portfolio_rebalance_deliveries').update({
    status: nextAttemptAt ? 'retry' : 'failed',
    attempts,
    next_attempt_at: nextAttemptAt,
    last_error: message.slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'processing');
  ensure(error, 'portfolio_rebalance_deliveries.failure');
}

const PORTFOLIO_LEDGER_PAGE_SIZE = 1_000;
const PORTFOLIO_LEDGER_LIMIT = 50_000;

export async function listPortfolioTransactions(
  userId: string,
  portfolioId: string,
  limit = PORTFOLIO_LEDGER_LIMIT,
): Promise<readonly PortfolioTransaction[]> {
  const requestedLimit = Math.max(1, Math.min(limit, PORTFOLIO_LEDGER_LIMIT));
  const admin = getSupabaseAdmin();
  const { count, error: countError } = await admin.from('portfolio_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolioId).eq('user_id', userId);
  ensure(countError, 'portfolio_transactions.count');
  const total = count ?? 0;
  if (total > requestedLimit) {
    throw new Error(`portfolio_transactions.select: ledger exceeds supported limit ${requestedLimit}`);
  }

  const rows: TransactionRow[] = [];
  for (let offset = 0; offset < total; offset += PORTFOLIO_LEDGER_PAGE_SIZE) {
    const end = Math.min(total, offset + PORTFOLIO_LEDGER_PAGE_SIZE) - 1;
    const { data, error } = await admin.from('portfolio_transactions').select('*')
      .eq('portfolio_id', portfolioId).eq('user_id', userId)
      .order('trade_at', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, end);
    ensure(error, 'portfolio_transactions.select');
    const page = (data ?? []) as TransactionRow[];
    if (page.length !== end - offset + 1) {
      throw new Error('portfolio_transactions.select: ledger changed during reconstruction');
    }
    rows.push(...page);
  }
  return Object.freeze(rows.map(transaction));
}

export interface AppendTransactionInput {
  readonly kind: Exclude<PortfolioTransactionKind, 'reversal'>;
  readonly symbol?: string;
  readonly quantity: number;
  readonly price: number;
  readonly cashAmount: number;
  readonly fees: number;
  readonly tradeAt: string;
  readonly note?: string;
}

export async function appendPortfolioTransaction(
  userId: string,
  portfolioId: string,
  idempotencyKey: string,
  input: AppendTransactionInput,
): Promise<PortfolioTransaction> {
  const { data, error } = await getSupabaseAdmin().rpc('append_portfolio_transaction', {
    p_user_id: userId,
    p_portfolio_id: portfolioId,
    p_idempotency_key: idempotencyKey,
    p_kind: input.kind,
    p_symbol: input.symbol ?? null,
    p_quantity: input.quantity,
    p_price: input.price,
    p_cash_amount: input.cashAmount,
    p_fees: input.fees,
    p_trade_at: input.tradeAt,
    p_note: input.note ?? null,
  });
  ensure(error, 'portfolio_transactions.append');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('portfolio_transactions.append: empty response');
  return transaction(row as TransactionRow);
}

export async function reversePortfolioTransaction(
  userId: string,
  portfolioId: string,
  transactionId: string,
  idempotencyKey: string,
  note?: string,
): Promise<PortfolioTransaction> {
  const { data, error } = await getSupabaseAdmin().rpc('reverse_latest_portfolio_transaction', {
    p_user_id: userId,
    p_portfolio_id: portfolioId,
    p_transaction_id: transactionId,
    p_idempotency_key: idempotencyKey,
    p_note: note ?? null,
  });
  ensure(error, 'portfolio_transactions.reverse');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('portfolio_transactions.reverse: empty response');
  return transaction(row as TransactionRow);
}

export interface ThesisInput {
  readonly portfolioId?: string;
  readonly symbol: string;
  readonly title: string;
  readonly thesis: string;
  readonly bullCase: string;
  readonly bearCase: string;
  readonly catalysts: readonly string[];
  readonly invalidation: string;
  readonly targetPrice?: number;
  readonly confidence: number;
  readonly status: InvestmentThesisStatus;
  readonly evidence: readonly AiSource[];
  readonly evidenceHash?: string;
}

export async function listInvestmentTheses(
  userId: string,
  filters: Readonly<{ portfolioId?: string; symbol?: string; includeArchived?: boolean }> = {},
): Promise<readonly InvestmentThesis[]> {
  let query = getSupabaseAdmin().from('investment_theses').select('*').eq('user_id', userId);
  if (filters.portfolioId) query = query.eq('portfolio_id', filters.portfolioId);
  if (filters.symbol) query = query.eq('symbol', filters.symbol);
  if (!filters.includeArchived) query = query.neq('status', 'archived');
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
  ensure(error, 'investment_theses.select');
  return Object.freeze(((data ?? []) as ThesisRow[]).map(thesis));
}

export async function createInvestmentThesis(userId: string, input: ThesisInput): Promise<InvestmentThesis> {
  const { data, error } = await getSupabaseAdmin().from('investment_theses').insert({
    user_id: userId,
    portfolio_id: input.portfolioId ?? null,
    symbol: input.symbol,
    title: input.title,
    thesis: input.thesis,
    bull_case: input.bullCase,
    bear_case: input.bearCase,
    catalysts: [...input.catalysts],
    invalidation: input.invalidation,
    target_price: input.targetPrice ?? null,
    confidence: input.confidence,
    status: input.status,
    evidence: [...input.evidence],
    evidence_hash: input.evidenceHash ?? null,
  }).select('*').single();
  ensure(error, 'investment_theses.insert');
  return thesis(data as ThesisRow);
}

export async function updateInvestmentThesis(
  userId: string,
  thesisId: string,
  patch: Partial<ThesisInput>,
): Promise<InvestmentThesis> {
  const values: Record<string, unknown> = {};
  if (patch.portfolioId !== undefined) values.portfolio_id = patch.portfolioId || null;
  if (patch.symbol !== undefined) values.symbol = patch.symbol;
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.thesis !== undefined) values.thesis = patch.thesis;
  if (patch.bullCase !== undefined) values.bull_case = patch.bullCase;
  if (patch.bearCase !== undefined) values.bear_case = patch.bearCase;
  if (patch.catalysts !== undefined) values.catalysts = [...patch.catalysts];
  if (patch.invalidation !== undefined) values.invalidation = patch.invalidation;
  if (patch.targetPrice !== undefined) values.target_price = patch.targetPrice;
  if (patch.confidence !== undefined) values.confidence = patch.confidence;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.evidence !== undefined) values.evidence = [...patch.evidence];
  if (patch.evidenceHash !== undefined) values.evidence_hash = patch.evidenceHash;
  const { data, error } = await getSupabaseAdmin().from('investment_theses').update(values)
    .eq('id', thesisId).eq('user_id', userId).select('*').single();
  ensure(error, 'investment_theses.update');
  return thesis(data as ThesisRow);
}

export async function archiveInvestmentThesis(userId: string, thesisId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('investment_theses')
    .update({ status: 'archived' }).eq('id', thesisId).eq('user_id', userId);
  ensure(error, 'investment_theses.archive');
}

export async function listPortfolioSnapshots(
  userId: string,
  portfolioId: string,
  limit = 365,
): Promise<readonly PortfolioSnapshot[]> {
  const { data, error } = await getSupabaseAdmin().from('portfolio_snapshots').select(
    'id,portfolio_id,user_id,captured_at,as_of,total_value,cash_balance,market_value,net_contributions,total_return,valuation_quality',
  ).eq('portfolio_id', portfolioId).eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 2_000)));
  ensure(error, 'portfolio_snapshots.select');
  return Object.freeze(((data ?? []) as SnapshotRow[]).map(snapshot).reverse());
}

export interface SnapshotPortfolioTarget {
  readonly id: string;
  readonly userId: string;
}
export async function listSnapshotTargets(limit: number): Promise<readonly SnapshotPortfolioTarget[]> {
  const { data, error } = await getSupabaseAdmin().from('portfolios').select('id,user_id')
    .eq('status', 'active').order('last_snapshot_attempt_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  ensure(error, 'portfolio_snapshots.targets');
  return Object.freeze(((data ?? []) as Array<{ id: string; user_id: string }>).map((row) => Object.freeze({
    id: row.id,
    userId: row.user_id,
  })));
}

export async function markPortfolioSnapshotAttempt(portfolioId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('portfolios')
    .update({ last_snapshot_attempt_at: new Date().toISOString() })
    .eq('id', portfolioId);
  ensure(error, 'portfolio_snapshots.mark_attempt');
}

export async function insertPortfolioSnapshot(userId: string, summary: PortfolioSummary): Promise<void> {
  const capturedDate = new Date();
  capturedDate.setUTCSeconds(0, 0);
  capturedDate.setUTCMinutes(Math.floor(capturedDate.getUTCMinutes() / 15) * 15);
  const capturedAt = new Date().toISOString();
  const bucket = capturedDate.toISOString();
  const { error } = await getSupabaseAdmin().from('portfolio_snapshots').upsert({
    portfolio_id: summary.portfolio.id,
    user_id: userId,
    captured_at: capturedAt,
    capture_bucket: bucket,
    as_of: summary.asOfISO,
    total_value: summary.totalValue,
    cash_balance: summary.cashBalance,
    market_value: summary.marketValue,
    net_contributions: summary.netContributions,
    total_return: summary.totalReturn,
    valuation_quality: summary.valuationQuality,
    metrics: summary.risk,
    holdings: summary.holdings,
  }, { onConflict: 'portfolio_id,capture_bucket', ignoreDuplicates: true });
  ensure(error, 'portfolio_snapshots.insert');
}
