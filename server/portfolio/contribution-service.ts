import { ApiError } from '../http/function.js';
import { logger } from '../observability/logger.js';
import {
  computeContributionPlan,
  projectInvestmentGoal,
  type ContributionPlan,
} from '../../src/domain/portfolio/contribution-plan.js';
import {
  estimateActualPortfolioOrderCosts,
  optimizePortfolioOrders,
  type PortfolioOrderOptimizationResult,
} from '../../src/domain/portfolio/order-optimizer.js';
import type {
  PortfolioAllocationPolicy,
  PortfolioContributionRun,
  PortfolioGoal,
  PortfolioGoalProjection,
  PortfolioHolding,
  PortfolioOrderCostBreakdown,
  PortfolioOrderCostPolicy,
  PortfolioRebalanceExecutionLink,
  PortfolioSummary,
} from '../../src/shared/api.js';
import {
  buildTargetAwarePortfolioSummary,
  rebalanceRequestHash,
} from './rebalance-service.js';
import { buildPortfolioSummary } from './service.js';
import {
  completePortfolioContributionRun,
  createPortfolioContributionRun,
  expirePortfolioRebalanceRuns,
  findContributionIdempotency,
  getPortfolioAllocationPolicy,
  getPortfolioContributionRun,
  getPortfolioGoal,
  getPortfolioGoalById,
  listContributionScanTargets,
  markContributionScanAttempt,
  savePortfolioGoal as savePortfolioGoalRecord,
  transitionPortfolioContributionRun,
  transitionPortfolioGoal as transitionPortfolioGoalRecord,
  type PortfolioComputedExecutionLink,
  type SavePortfolioGoalInput,
} from './store.js';

const PLAN_VALID_HOURS = 168;
const PRICE_MAX_AGE_HOURS = 96;
const PRICE_MOVE_REAPPROVAL_PCT = 3;
const HOUR_MS = 3_600_000;

const LEGACY_COST_POLICY: PortfolioOrderCostPolicy = Object.freeze({
  commissionFixedUsd: 0,
  commissionBps: 0,
  buySlippageBps: 0,
  sellSlippageBps: 0,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 0,
  maxCostPct: 100,
  taxLotMethod: 'fifo',
});

function legacyBuyCosts(fill: PortfolioRebalanceExecutionLink): PortfolioOrderCostBreakdown {
  return Object.freeze({
    commission: fill.fees,
    slippage: 0,
    transactionTax: 0,
    capitalGainsTax: 0,
    tax: 0,
    taxableGain: 0,
    total: fill.fees,
    netCashEffect: -(fill.quantity * fill.price + fill.fees),
  });
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function nextMonthlyDate(value: string, contributionDay: number): string {
  const current = utcDate(value);
  return isoDate(new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth() + 1,
    contributionDay,
  )));
}

export function contributionPeriodsRemaining(goal: PortfolioGoal, asOf = new Date()): number {
  const target = goal.targetDate;
  let cursor = goal.nextContributionDate;
  let periods = 0;
  const today = isoDate(asOf);
  if (cursor < today) cursor = today;
  while (cursor <= target && periods < 1_200) {
    periods += 1;
    cursor = nextMonthlyDate(cursor, goal.contributionDay);
  }
  return periods;
}

function goalProjection(
  goal: PortfolioGoal,
  summary: PortfolioSummary,
  asOf = new Date(),
): PortfolioGoalProjection {
  const periods = contributionPeriodsRemaining(goal, asOf);
  const reliable = summary.valuationQuality === 'verified'
    || (summary.holdings.length === 0 && summary.marketValue === 0);
  const funded = summary.totalValue >= goal.targetAmount;
  const overdue = goal.targetDate < isoDate(asOf);
  const projection = periods > 0
    ? projectInvestmentGoal({
      currentValue: summary.totalValue,
      goalValue: goal.targetAmount,
      monthlyContribution: goal.contributionAmount,
      annualReturnPct: goal.expectedAnnualReturnPct,
      horizonMonths: periods,
    })
    : null;
  const status: PortfolioGoalProjection['status'] = !reliable
    ? 'insufficient-data'
    : funded
      ? 'funded'
      : overdue || periods === 0
        ? 'overdue'
        : projection?.status === 'on-track'
          ? 'on-track'
          : projection?.status === 'shortfall'
            ? 'behind'
            : 'insufficient-data';
  const projectedAmount = projection?.projectedValue ?? summary.totalValue;
  return Object.freeze({
    status,
    currentValue: summary.totalValue,
    targetAmount: goal.targetAmount,
    progressPct: Math.round(Math.min(100, summary.totalValue / goal.targetAmount * 100) * 100) / 100,
    contributionPeriodsRemaining: periods,
    projectedAmount,
    requiredContributionAmount: projection?.requiredMonthlyContribution ?? 0,
    projectedShortfall: Math.max(0, goal.targetAmount - projectedAmount),
    asOfISO: summary.asOfISO,
    valuationQuality: summary.valuationQuality,
  });
}

export async function getPortfolioGoalView(
  userId: string,
  portfolioId: string,
  requestId: string,
): Promise<Readonly<{ goal: PortfolioGoal | null; projection: PortfolioGoalProjection | null }>> {
  const goal = await getPortfolioGoal(userId, portfolioId);
  if (!goal) return Object.freeze({ goal: null, projection: null });
  const summary = await buildPortfolioSummary(userId, portfolioId, `${requestId}:goal`, { includeRisk: false });
  return Object.freeze({ goal, projection: goalProjection(goal, summary) });
}

function goalStoreError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/version|updated_at|changed/i.test(message)) {
    throw new ApiError(409, 'GOAL_VERSION_CONFLICT', '목표가 다른 요청에서 변경되었습니다. 새로고침 후 다시 시도하세요.');
  }
  if (/portfolio.*not found|active portfolio/i.test(message)) {
    throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '활성 포트폴리오를 찾을 수 없습니다.');
  }
  if (/goal.*not found/i.test(message)) {
    throw new ApiError(404, 'GOAL_NOT_FOUND', '투자 목표를 찾을 수 없습니다.');
  }
  if (/invalid goal transition/i.test(message)) {
    throw new ApiError(409, 'GOAL_STATE_CONFLICT', '현재 목표 상태에서는 요청한 변경을 적용할 수 없습니다.');
  }
  throw error;
}

export async function savePortfolioGoal(
  userId: string,
  input: SavePortfolioGoalInput,
): Promise<PortfolioGoal> {
  try {
    return await savePortfolioGoalRecord(userId, input);
  } catch (error) {
    return goalStoreError(error);
  }
}

export async function transitionPortfolioGoal(
  userId: string,
  goalId: string,
  action: 'pause' | 'resume' | 'archive' | 'complete',
  expectedUpdatedAt: string,
  requestId: string,
): Promise<PortfolioGoal> {
  try {
    if (action === 'complete') {
      const current = await getPortfolioGoalById(userId, goalId);
      if (!current) throw new ApiError(404, 'GOAL_NOT_FOUND', '투자 목표를 찾을 수 없습니다.');
      const summary = await buildPortfolioSummary(userId, current.portfolioId, `${requestId}:complete-goal`, { includeRisk: false });
      if (goalProjection(current, summary).status !== 'funded') {
        throw new ApiError(409, 'GOAL_NOT_FUNDED', '검증 가능한 현재 가치가 목표금액에 도달한 뒤 완료할 수 있습니다.');
      }
    }
    return await transitionPortfolioGoalRecord(userId, goalId, action, expectedUpdatedAt);
  } catch (error) {
    return goalStoreError(error);
  }
}

function verifiedHolding(holding: PortfolioHolding | undefined): holding is PortfolioHolding & {
  readonly price: number;
  readonly provenance: NonNullable<PortfolioHolding['provenance']>;
} {
  if (!holding?.price || !holding.provenance || holding.valuationQuality !== 'verified') return false;
  const providerBacked = holding.provenance.quality === 'provider' || holding.provenance.quality === 'verified';
  const accepted = !holding.provenance.verification || holding.provenance.verification.decision === 'accepted';
  return providerBacked && accepted && ['live', 'delayed', 'snapshot'].includes(holding.provenance.mode);
}

function contributionPlan(
  summary: PortfolioSummary,
  policy: PortfolioAllocationPolicy,
  amount: number,
): ContributionPlan {
  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  return computeContributionPlan({
    contributionAmount: amount,
    minOrderValue: policy.minTradeValue,
    totalValueBefore: summary.totalValue,
    targets: policy.targets.map((target) => ({
      symbol: target.symbol,
      currentValue: target.symbol === 'CASH'
        ? summary.cashBalance
        : holdings.get(target.symbol)?.marketValue ?? 0,
      targetPct: target.targetPct,
    })),
  });
}

interface CostAwareContributionPlan {
  readonly base: ContributionPlan;
  readonly optimization: PortfolioOrderOptimizationResult;
}

function costAwareContributionPlan(
  summary: PortfolioSummary,
  policy: PortfolioAllocationPolicy,
  amount: number,
): CostAwareContributionPlan {
  const base = contributionPlan(summary, policy, amount);
  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const optimization = optimizePortfolioOrders({
    mode: 'contribution',
    cashBalance: amount,
    requiredCashReserve: base.cashTargetAmount,
    minTradeValue: policy.minTradeValue,
    policy: policy.costPolicy,
    candidates: base.items.map((item) => {
      const holding = holdings.get(item.symbol);
      return Object.freeze({
        symbol: item.symbol,
        action: item.orderValue > 0 ? 'buy' as const : 'hold' as const,
        requestedTradeValue: item.orderValue,
        ...(item.orderValue > 0 && verifiedHolding(holding) ? { referencePrice: holding.price } : {}),
        priority: item.priority,
      });
    }),
  });
  return Object.freeze({ base, optimization });
}

function sameCostPolicy(
  left: PortfolioAllocationPolicy['costPolicy'],
  right: PortfolioAllocationPolicy['costPolicy'],
): boolean {
  return left.commissionFixedUsd === right.commissionFixedUsd
    && left.commissionBps === right.commissionBps
    && left.buySlippageBps === right.buySlippageBps
    && left.sellSlippageBps === right.sellSlippageBps
    && left.sellTransactionTaxBps === right.sellTransactionTaxBps
    && left.capitalGainsTaxPct === right.capitalGainsTaxPct
    && left.maxCostPct === right.maxCostPct
    && left.taxLotMethod === right.taxLotMethod;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100;
}

function priceSafetyReasons(
  summary: PortfolioSummary,
  plan: ContributionPlan,
  baseline?: ReadonlyMap<string, number>,
): readonly string[] {
  const reasons: string[] = [];
  const now = Date.now();
  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const heldPositions = summary.holdings.filter((holding) => holding.quantity > 0);
  if (heldPositions.some((holding) => !verifiedHolding(holding))) {
    reasons.push('현재 보유자산 전체에 검증된 가격이 필요합니다.');
  }
  for (const item of plan.items.filter((entry) => entry.orderValue > 0)) {
    const holding = holdings.get(item.symbol);
    if (!verifiedHolding(holding)) {
      reasons.push(`${item.symbol} 검증 가격과 출처가 없습니다.`);
      continue;
    }
    const priceAt = new Date(holding.provenance.providerTimestamp).getTime();
    if (!Number.isFinite(priceAt) || now - priceAt > PRICE_MAX_AGE_HOURS * HOUR_MS || priceAt - now > HOUR_MS) {
      reasons.push(`${item.symbol} 가격이 ${PRICE_MAX_AGE_HOURS}시간 유효 범위를 벗어났습니다.`);
    }
    const reference = baseline?.get(item.symbol);
    if (reference && Math.abs(holding.price / reference - 1) * 100 > PRICE_MOVE_REAPPROVAL_PCT) {
      reasons.push(`${item.symbol} 가격이 기준 대비 ${PRICE_MOVE_REAPPROVAL_PCT}%를 초과해 변동했습니다.`);
    }
  }
  return Object.freeze([...new Set(reasons)]);
}

function generationReasons(
  goal: PortfolioGoal,
  summary: PortfolioSummary,
  plan: CostAwareContributionPlan,
): readonly string[] {
  const reasons: string[] = [];
  if (goal.status !== 'active') reasons.push('활성 상태의 투자 목표가 필요합니다.');
  if (goal.targetDate < isoDate(new Date())) reasons.push('목표일이 지났습니다.');
  if (summary.totalValue >= goal.targetAmount) reasons.push('현재 포트폴리오 가치가 이미 목표금액에 도달했습니다.');
  if (plan.base.status === 'invalid') reasons.push(...plan.base.warnings);
  if (plan.optimization.status === 'invalid') reasons.push(...plan.optimization.warnings);
  if (plan.base.items.length > 500) reasons.push('배분 항목이 500개 제한을 초과했습니다.');
  if (plan.base.allocatedAmount - goal.contributionAmount > 0.001) reasons.push('제안 매수금액이 정기 납입금을 초과했습니다.');
  reasons.push(...priceSafetyReasons(summary, plan.base));
  return Object.freeze([...new Set(reasons)]);
}

async function replayContributionRequest(
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  expectedEvent: 'created' | 'approved' | 'completed' | 'rejected',
): Promise<PortfolioContributionRun | null> {
  const replay = await findContributionIdempotency(userId, idempotencyKey);
  if (!replay) return null;
  if (replay.requestHash !== requestHash || replay.event !== expectedEvent) {
    if (replay.event === 'expired' && replay.run.terminalReason?.startsWith('재승인 필요:')) {
      throw new ApiError(409, 'CONTRIBUTION_REAPPROVAL_REQUIRED', replay.run.terminalReason);
    }
    throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', '동일한 Idempotency-Key가 다른 납입 요청에 사용되었습니다.');
  }
  return replay.run;
}

function contributionConflict(error: unknown, fallback: string): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/open investment plan|another investment plan|awaiting review|one_open|duplicate key/i.test(message)) {
    throw new ApiError(409, 'INVESTMENT_PLAN_OPEN', '먼저 진행 중인 리밸런싱 또는 납입 계획을 처리하세요.');
  }
  if (/not found/i.test(message)) {
    throw new ApiError(404, 'CONTRIBUTION_NOT_FOUND', '정기 납입 계획 또는 연결 데이터를 찾을 수 없습니다.');
  }
  if (/changed|expired|only approved|only pending|cannot be|idempotency|invalid contribution|fill|approval|exceed/i.test(message)) {
    throw new ApiError(409, 'CONTRIBUTION_WORKFLOW_CONFLICT', fallback);
  }
  throw error;
}

export async function generateContributionRun(
  userId: string,
  portfolioId: string,
  goalId: string,
  source: 'manual' | 'scheduled',
  idempotencyKey: string,
  requestId: string,
): Promise<Readonly<{ run: PortfolioContributionRun; created: boolean }> | null> {
  const goal = await getPortfolioGoal(userId, portfolioId);
  if (!goal || goal.id !== goalId) {
    if (source === 'scheduled') return null;
    throw new ApiError(409, 'GOAL_REQUIRED', '먼저 활성 투자 목표를 저장하세요.');
  }
  const scheduledFor = source === 'scheduled' ? goal.nextContributionDate : undefined;
  const requestHash = rebalanceRequestHash({ action: 'generate', portfolioId, goalId, source, scheduledFor });
  const replay = await replayContributionRequest(userId, idempotencyKey, requestHash, 'created');
  if (replay) return Object.freeze({ run: replay, created: false });
  const policy = await getPortfolioAllocationPolicy(userId, portfolioId);
  if (!policy) {
    if (source === 'scheduled') return null;
    throw new ApiError(409, 'ALLOCATION_POLICY_REQUIRED', '먼저 목표배분 정책을 저장하세요.');
  }
  const summary = await buildTargetAwarePortfolioSummary(userId, portfolioId, policy, `${requestId}:summary`);
  if (source === 'scheduled' && summary.valuationQuality === 'verified'
    && summary.totalValue >= goal.targetAmount) {
    await transitionPortfolioGoalRecord(userId, goal.id, 'complete', goal.updatedAt);
    logger.info('contribution.goal_completed', { portfolioId, goalId });
    return null;
  }
  const plan = costAwareContributionPlan(summary, policy, goal.contributionAmount);
  const reasons = generationReasons(goal, summary, plan);
  if (reasons.length) {
    if (source === 'scheduled') {
      logger.warn('contribution.plan_skipped', { portfolioId, goalId, reasons });
      return null;
    }
    throw new ApiError(409, 'CONTRIBUTION_PLAN_UNSAFE', reasons.join(' '));
  }

  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const optimizedOrders = new Map(plan.optimization.orders.map((order) => [order.symbol, order]));
  const items = plan.base.items.map((item) => {
    const holding = holdings.get(item.symbol);
    const optimized = optimizedOrders.get(item.symbol);
    if (!optimized) throw new ApiError(409, 'CONTRIBUTION_PLAN_UNSAFE', `${item.symbol} 비용 최적화 결과가 없습니다.`);
    const action = optimized.action === 'buy' ? 'buy' as const : 'hold' as const;
    return Object.freeze({
      symbol: item.symbol,
      currentQuantity: item.symbol === 'CASH' ? summary.cashBalance : holding?.quantity ?? 0,
      currentValue: item.currentValue,
      currentPct: item.currentPct,
      targetValue: item.targetValueAfterContribution,
      targetPct: item.targetPct,
      driftPct: item.currentPct - item.targetPct,
      action,
      requestedTradeValue: optimized.requestedTradeValue,
      tradeValue: optimized.tradeValue,
      optimizationDecision: optimized.optimizationDecision,
      estimatedCosts: optimized.estimatedCosts,
      estimatedCostBasis: optimized.estimatedCostBasis,
      taxLotSnapshot: optimized.taxLotSnapshot,
      ...(item.orderValue > 0 && verifiedHolding(holding) ? {
        referencePrice: holding.price,
        priceAsOf: holding.provenance.providerTimestamp,
        provenance: holding.provenance,
      } : {}),
      ...(optimized.estimatedQuantity === undefined ? {} : {
        estimatedQuantity: optimized.estimatedQuantity,
      }),
    });
  });
  const cashRemainder = money(goal.contributionAmount
    - items.reduce((sum, item) => sum + item.tradeValue, 0));
  const maxDriftPct = Math.max(0, ...items.map((item) => Math.abs(item.driftPct)));
  const planHash = rebalanceRequestHash({
    portfolioId,
    goalId,
    scheduledFor,
    goalUpdatedAt: goal.updatedAt,
    policyUpdatedAt: policy.updatedAt,
    portfolioUpdatedAt: summary.portfolio.updatedAt,
    valuationAsOf: summary.asOfISO,
    contributionAmount: goal.contributionAmount,
    targets: policy.targets,
    costPolicy: policy.costPolicy,
    items,
  });
  try {
    return await createPortfolioContributionRun(userId, idempotencyKey, requestHash, {
      portfolioId,
      goalId,
      source,
      ...(scheduledFor ? { scheduledFor } : {}),
      planHash,
      goalUpdatedAt: goal.updatedAt,
      policyUpdatedAt: policy.updatedAt,
      portfolioUpdatedAt: summary.portfolio.updatedAt,
      valuationAsOf: summary.asOfISO,
      valuationQuality: 'verified',
      totalValue: summary.totalValue,
      cashBalance: summary.cashBalance,
      contributionAmount: goal.contributionAmount,
      minTradeValue: policy.minTradeValue,
      maxDriftPct,
      cashRemainder,
      estimatedCashAfter: money(summary.cashBalance + plan.optimization.estimatedSpendableCashAfter),
      expiresAt: new Date(Date.now() + PLAN_VALID_HOURS * HOUR_MS).toISOString(),
      items,
    });
  } catch (error) {
    contributionConflict(error, '정기 납입 계획을 저장하지 못했습니다.');
  }
}

function approvalPriceMap(run: PortfolioContributionRun): ReadonlyMap<string, number> {
  const event = [...run.audit].reverse().find((entry) => entry.event === 'approved');
  const values = event?.details.prices;
  if (!Array.isArray(values)) return new Map();
  return new Map(values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const symbol = typeof row.symbol === 'string' ? row.symbol : '';
    const price = Number(row.price);
    return symbol && Number.isFinite(price) && price > 0 ? [[symbol, price] as const] : [];
  }));
}

async function currentAssessment(
  userId: string,
  run: PortfolioContributionRun,
  requestId: string,
  phase: 'approve' | 'execute',
): Promise<Readonly<{
  safe: boolean;
  reasons: readonly string[];
  prices: readonly Readonly<{ symbol: string; price: number; priceAsOf: string }>[];
}>> {
  const reasons: string[] = [];
  const goal = await getPortfolioGoal(userId, run.portfolioId);
  const policy = await getPortfolioAllocationPolicy(userId, run.portfolioId);
  if (!goal || goal.id !== run.goalId) reasons.push('연결된 투자 목표가 없습니다.');
  if (!policy) reasons.push('목표배분 정책이 없습니다.');
  if (!goal || !policy) return Object.freeze({ safe: false, reasons: Object.freeze(reasons), prices: Object.freeze([]) });
  if (goal.status !== 'active') reasons.push('투자 목표가 활성 상태가 아닙니다.');
  if (goal.updatedAt !== run.goalUpdatedAt) reasons.push('투자 목표가 계획 생성 후 변경되었습니다.');
  if (policy.updatedAt !== run.policyUpdatedAt) reasons.push('목표배분 정책이 계획 생성 후 변경되었습니다.');
  if (run.costModelVersion === 1 && !sameCostPolicy(policy.costPolicy, run.costPolicySnapshot)) {
    reasons.push('세금·수수료·슬리피지 정책이 계획 생성 후 변경되었습니다.');
  }
  if (run.expiresAt <= new Date().toISOString()) reasons.push('납입 계획의 유효기간이 만료되었습니다.');
  const summary = await buildTargetAwarePortfolioSummary(userId, run.portfolioId, policy, `${requestId}:revalidate`);
  if (goal.targetDate < isoDate(new Date())) reasons.push('투자 목표일이 지났습니다. 목표를 다시 설정해 주세요.');
  if (summary.totalValue >= goal.targetAmount) reasons.push('현재 포트폴리오 가치가 이미 목표금액에 도달했습니다.');
  if (summary.portfolio.updatedAt !== run.portfolioUpdatedAt) reasons.push('포트폴리오 원장이 계획 생성 후 변경되었습니다.');
  const assessmentPolicy = run.costModelVersion === 0
    ? Object.freeze({ ...policy, costPolicy: LEGACY_COST_POLICY })
    : policy;
  const plan = costAwareContributionPlan(summary, assessmentPolicy, run.contributionAmount);
  if (plan.base.status === 'invalid') reasons.push(...plan.base.warnings);
  if (plan.optimization.status === 'invalid') reasons.push(...plan.optimization.warnings);
  const currentOrders = new Map(plan.optimization.orders.map((order) => [order.symbol, order]));
  if (run.items.length !== plan.base.items.length) reasons.push('현재 목표배분 항목이 기존 납입 계획과 다릅니다.');
  for (const item of run.items) {
    const current = currentOrders.get(item.symbol);
    const currentAction = current?.action === 'buy' ? 'buy' : 'hold';
    if (!current || currentAction !== item.action) {
      reasons.push(`${item.symbol}의 비용 최적화 주문 방향이 계획 생성 후 변경되었습니다.`);
    } else if (run.costModelVersion === 1
      && current.optimizationDecision !== item.optimizationDecision) {
      reasons.push(`${item.symbol}의 비용 최적화 판단이 계획 생성 후 변경되었습니다.`);
    }
  }
  const baseline = phase === 'execute'
    ? approvalPriceMap(run)
    : new Map(run.items.flatMap((item) => item.referencePrice ? [[item.symbol, item.referencePrice] as const] : []));
  reasons.push(...priceSafetyReasons(summary, plan.base, baseline));
  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const prices = run.items.filter((item) => item.action === 'buy').flatMap((item) => {
    const holding = holdings.get(item.symbol);
    return verifiedHolding(holding) ? [Object.freeze({
      symbol: item.symbol,
      price: holding.price,
      priceAsOf: holding.provenance.providerTimestamp,
    })] : [];
  });
  return Object.freeze({
    safe: reasons.length === 0 && prices.length === run.items.filter((item) => item.action === 'buy').length,
    reasons: Object.freeze([...new Set(reasons)]),
    prices: Object.freeze(prices),
  });
}

async function expireForReapproval(
  userId: string,
  run: PortfolioContributionRun,
  reasons: readonly string[],
  idempotencyKey: string,
  requestHash: string,
): Promise<never> {
  const reason = `재승인 필요: ${reasons.join(' ')}`.slice(0, 500);
  try {
    await transitionPortfolioContributionRun(
      userId,
      run.id,
      'expired',
      reason,
      undefined,
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    contributionConflict(error, reason);
  }
  throw new ApiError(409, 'CONTRIBUTION_REAPPROVAL_REQUIRED', reason);
}

export async function approveContributionRun(
  userId: string,
  runId: string,
  idempotencyKey: string,
  requestId: string,
): Promise<PortfolioContributionRun> {
  const requestHash = rebalanceRequestHash({ action: 'approve', runId });
  const replay = await replayContributionRequest(userId, idempotencyKey, requestHash, 'approved');
  if (replay) return replay;
  const run = await getPortfolioContributionRun(userId, runId);
  if (!run) throw new ApiError(404, 'CONTRIBUTION_NOT_FOUND', '정기 납입 계획을 찾을 수 없습니다.');
  const assessment = await currentAssessment(userId, run, requestId, 'approve');
  if (!assessment.safe) return expireForReapproval(userId, run, assessment.reasons, idempotencyKey, requestHash);
  try {
    return await transitionPortfolioContributionRun(
      userId,
      run.id,
      'approved',
      undefined,
      { prices: assessment.prices },
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    contributionConflict(error, '정기 납입 계획을 승인하지 못했습니다.');
  }
}

export async function rejectContributionRun(
  userId: string,
  runId: string,
  reason: string,
  idempotencyKey: string,
): Promise<PortfolioContributionRun> {
  const requestHash = rebalanceRequestHash({ action: 'reject', runId, reason });
  const replay = await replayContributionRequest(userId, idempotencyKey, requestHash, 'rejected');
  if (replay) return replay;
  try {
    return await transitionPortfolioContributionRun(
      userId,
      runId,
      'rejected',
      reason,
      undefined,
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    contributionConflict(error, '정기 납입 계획을 거절하지 못했습니다.');
  }
}

export async function executeContributionRun(
  userId: string,
  runId: string,
  depositAt: string,
  fills: readonly PortfolioRebalanceExecutionLink[],
  idempotencyKey: string,
  requestId: string,
): Promise<PortfolioContributionRun> {
  const requestHash = rebalanceRequestHash({ action: 'complete', runId, depositAt, fills });
  const replay = await replayContributionRequest(userId, idempotencyKey, requestHash, 'completed');
  if (replay) return replay;
  const run = await getPortfolioContributionRun(userId, runId);
  if (!run) throw new ApiError(404, 'CONTRIBUTION_NOT_FOUND', '정기 납입 계획을 찾을 수 없습니다.');
  const expected = run.items.filter((item) => item.action === 'buy');
  const expectedById = new Map(expected.map((item) => [item.id, item]));
  const fillIds = new Set(fills.map((fill) => fill.itemId));
  if (fills.length !== expected.length || fillIds.size !== expected.length
    || fills.some((fill) => !expectedById.has(fill.itemId))) {
    throw new ApiError(400, 'CONTRIBUTION_FILLS_INCOMPLETE', '모든 제안 매수마다 정확히 하나의 실제 체결이 필요합니다.');
  }

  const executionReasons: string[] = [];
  const approvedPrices = approvalPriceMap(run);
  const computedFills: readonly PortfolioComputedExecutionLink[] = Object.freeze(fills.map((fill) => {
    const item = expectedById.get(fill.itemId);
    if (!item?.referencePrice || !item.estimatedQuantity) {
      throw new ApiError(409, 'CONTRIBUTION_PLAN_INVALID', '승인된 매수의 가격 또는 수량 스냅샷이 없습니다.');
    }
    if (fill.quantity - item.estimatedQuantity > 1e-9) {
      throw new ApiError(409, 'CONTRIBUTION_QUANTITY_EXCEEDED', `${item.symbol} 실제 수량이 승인 수량을 초과합니다.`);
    }
    let costs: PortfolioOrderCostBreakdown;
    if (run.costModelVersion === 0) {
      costs = legacyBuyCosts(fill);
    } else {
      try {
        costs = estimateActualPortfolioOrderCosts({
          symbol: item.symbol,
          action: 'buy',
          quantity: fill.quantity,
          referencePrice: item.referencePrice,
          actualPrice: fill.price,
          actualCommission: fill.fees,
          policy: run.costPolicySnapshot,
        }).costs;
      } catch (error) {
        const message = error instanceof Error ? error.message : '실제 체결 비용을 계산할 수 없습니다.';
        throw new ApiError(400, 'CONTRIBUTION_FILL_INVALID', message);
      }
    }
    const actualNotional = fill.quantity * fill.price;
    const economicCost = costs.commission
      + Math.max(0, costs.slippage)
      + costs.tax;
    const approvedPrice = approvedPrices.get(item.symbol);
    if (actualNotional + 1e-9 < run.minTradeValue) {
      executionReasons.push(`${item.symbol} 실제 주문금액이 최소 주문금액보다 작습니다.`);
    }
    if (Math.abs(fill.price / item.referencePrice - 1) * 100 > PRICE_MOVE_REAPPROVAL_PCT
      || (approvedPrice !== undefined
        && Math.abs(fill.price / approvedPrice - 1) * 100 > PRICE_MOVE_REAPPROVAL_PCT)) {
      executionReasons.push(`${item.symbol} 실제 체결가가 승인 가격 범위를 벗어났습니다.`);
    }
    if (run.costModelVersion === 1 && actualNotional > 0
      && economicCost * 100 - actualNotional * run.costPolicySnapshot.maxCostPct > 0.000001) {
      executionReasons.push(`${item.symbol} 실제 체결비용이 허용 비율을 초과했습니다.`);
    }
    return Object.freeze({ ...fill, actualCosts: costs });
  }));
  const actualSpend = computedFills.reduce(
    (sum, fill) => sum + fill.quantity * fill.price + fill.fees,
    0,
  );
  if (actualSpend > run.contributionAmount + 0.000001) {
    throw new ApiError(409, 'CONTRIBUTION_AMOUNT_EXCEEDED', '실제 매수금액과 수수료가 납입금을 초과합니다.');
  }
  const plannedCashReserve = Math.max(0, run.estimatedCashAfter - run.cashBalance);
  const actualCashRemainder = run.contributionAmount - actualSpend;
  if (run.costModelVersion === 1 && actualCashRemainder + 0.000001 < plannedCashReserve) {
    executionReasons.push('실제 체결 후 현금이 승인된 계획의 현금 잔여액보다 적습니다.');
  }
  const assessment = await currentAssessment(userId, run, requestId, 'execute');
  if (!assessment.safe || executionReasons.length) {
    return expireForReapproval(
      userId,
      run,
      [...assessment.reasons, ...executionReasons],
      idempotencyKey,
      requestHash,
    );
  }
  try {
    return await completePortfolioContributionRun(
      userId,
      run.id,
      depositAt,
      computedFills,
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    contributionConflict(error, '실제 납입과 체결을 원장에 반영하지 못했습니다.');
  }
}

export interface ContributionMonitorResult {
  readonly inspected: number;
  readonly created: number;
  readonly deduplicated: number;
  readonly skipped: number;
  readonly expired: number;
}

export async function monitorPortfolioContributions(requestId: string): Promise<ContributionMonitorResult> {
  const configured = Number.parseInt(process.env.CONTRIBUTION_SCAN_LIMIT ?? '10', 10);
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(configured, 50)) : 10;
  const expired = await expirePortfolioRebalanceRuns(250);
  const targets = await listContributionScanTargets(limit);
  let created = 0;
  let deduplicated = 0;
  let skipped = 0;
  for (const target of targets) {
    try {
      const result = await generateContributionRun(
        target.userId,
        target.portfolioId,
        target.goalId,
        'scheduled',
        `p8-cycle:${target.goalId}:${target.nextContributionDate}`,
        `${requestId}:${target.goalId}`,
      );
      if (!result) skipped += 1;
      else if (result.created) created += 1;
      else deduplicated += 1;
    } catch (error) {
      skipped += 1;
      logger.warn('contribution.scan_failed', {
        goalId: target.goalId,
        portfolioId: target.portfolioId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await markContributionScanAttempt(target.userId, target.goalId).catch((error: unknown) => {
        logger.warn('contribution.scan_cursor_failed', {
          goalId: target.goalId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
  return Object.freeze({ inspected: targets.length, created, deduplicated, skipped, expired });
}
