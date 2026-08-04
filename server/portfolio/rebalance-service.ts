import { createHash } from 'node:crypto';
import { ApiError } from '../http/function.js';
import { catalogQuote } from '../market/catalog.js';
import { getMarketQuotes } from '../market/service.js';
import { logger } from '../observability/logger.js';
import { computeRebalancePlan, type RebalancePlan, type RebalancePlanItem } from '../../src/domain/portfolio/rebalance.js';
import { assessRebalanceApproval } from '../../src/domain/portfolio/rebalance-workflow.js';
import { buildPortfolioOpenFifoLots } from '../../src/domain/portfolio/ledger.js';
import {
  estimateActualPortfolioOrderCosts,
  optimizePortfolioOrders,
  type PortfolioOrderOptimizationResult,
} from '../../src/domain/portfolio/order-optimizer.js';
import type {
  PortfolioAllocationPolicy,
  PortfolioHolding,
  PortfolioRebalanceExecutionLink,
  PortfolioOrderCostBreakdown,
  PortfolioOrderCostPolicy,
  PortfolioOrderOptimizationDecision,
  PortfolioTaxLotSlice,
  PortfolioRebalanceRun,
  PortfolioSummary,
  RemoteQuotePatch,
} from '../../src/shared/api.js';
import { buildPortfolioSummary } from './service.js';
import {
  completePortfolioRebalanceRun,
  createPortfolioRebalanceRun,
  expirePortfolioRebalanceRuns,
  findRebalanceIdempotency,
  getPortfolioAllocationPolicy,
  getPortfolioRebalanceRun,
  listRebalanceScanTargets,
  markRebalanceScanAttempt,
  listPortfolioTransactions,
  transitionPortfolioRebalanceRun,
  type PortfolioComputedExecutionLink,
} from './store.js';

const PLAN_VALID_HOURS = 72;
const PRICE_MAX_AGE_HOURS = 96;
const PRICE_MOVE_REAPPROVAL_PCT = 3;
const HOUR_MS = 3_600_000;
const QUANTITY_EPSILON = 1e-9;

const ZERO_ORDER_COSTS: PortfolioOrderCostBreakdown = Object.freeze({
  commission: 0,
  slippage: 0,
  transactionTax: 0,
  capitalGainsTax: 0,
  tax: 0,
  taxableGain: 0,
  total: 0,
  netCashEffect: 0,
});

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

function legacyActualCosts(
  action: 'buy' | 'sell',
  fill: PortfolioRebalanceExecutionLink,
): PortfolioOrderCostBreakdown {
  const notional = fill.quantity * fill.price;
  return Object.freeze({
    ...ZERO_ORDER_COSTS,
    commission: fill.fees,
    total: fill.fees,
    netCashEffect: action === 'buy' ? -(notional + fill.fees) : notional - fill.fees,
  });
}

interface CostAwareRebalancePlanItem extends RebalancePlanItem {
  readonly requestedTradeValue: number;
  readonly optimizationDecision: PortfolioOrderOptimizationDecision;
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly estimatedCostBasis: number;
  readonly taxLotSnapshot: readonly PortfolioTaxLotSlice[];
}

interface CostAwareRebalancePlan extends Omit<RebalancePlan, 'items'> {
  readonly items: readonly CostAwareRebalancePlanItem[];
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly estimatedTaxReserve: number;
  readonly optimizationStatus: PortfolioOrderOptimizationResult['status'];
}

async function replayRebalanceRequest(
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  expectedEvent: 'created' | 'approved' | 'completed' | 'rejected',
): Promise<PortfolioRebalanceRun | null> {
  const replay = await findRebalanceIdempotency(userId, idempotencyKey);
  if (!replay) return null;
  if (replay.requestHash !== requestHash) {
    throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', '같은 Idempotency-Key가 다른 요청에 이미 사용되었습니다.');
  }
  if (replay.event === expectedEvent) return replay.run;
  if (replay.event === 'expired' && replay.run.terminalReason?.startsWith('재승인 필요:')) {
    throw new ApiError(409, 'REBALANCE_REAPPROVAL_REQUIRED', replay.run.terminalReason);
  }
  throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key의 기존 처리 결과가 요청 동작과 다릅니다.');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

export function rebalanceRequestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function verifiedQuote(quote: RemoteQuotePatch): boolean {
  const providerBacked = quote.provenance.quality === 'provider' || quote.provenance.quality === 'verified';
  const accepted = !quote.provenance.verification || quote.provenance.verification.decision === 'accepted';
  return providerBacked && accepted && ['live', 'delayed', 'snapshot'].includes(quote.provenance.mode);
}

function zeroHolding(quote: RemoteQuotePatch): PortfolioHolding {
  const catalog = catalogQuote(quote.symbol);
  return Object.freeze({
    symbol: quote.symbol,
    quantity: 0,
    costBasis: 0,
    averageCost: 0,
    realizedPnl: 0,
    income: 0,
    feesPaid: 0,
    name: catalog?.nameKo ?? catalog?.name ?? quote.symbol,
    assetKind: catalog?.kind ?? 'stock',
    price: quote.price,
    marketValue: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    allocationPct: 0,
    valuationQuality: verifiedQuote(quote) ? 'verified' : 'estimated',
    provenance: quote.provenance,
  });
}

export async function buildTargetAwarePortfolioSummary(
  userId: string,
  portfolioId: string,
  policy: PortfolioAllocationPolicy,
  requestId: string,
): Promise<PortfolioSummary> {
  const summary = await buildPortfolioSummary(userId, portfolioId, requestId, { includeRisk: false });
  const held = new Set(summary.holdings.map((holding) => holding.symbol));
  const missing = policy.targets
    .map((target) => target.symbol)
    .filter((symbol) => symbol !== 'CASH' && !held.has(symbol));
  if (!missing.length) return summary;
  const response = await getMarketQuotes(missing, `${requestId}:targets`);
  const quotes = new Map(response.quotes.map((quote) => [quote.symbol, quote]));
  const additions = missing.flatMap((symbol) => {
    const quote = quotes.get(symbol);
    return quote ? [zeroHolding(quote)] : [];
  });
  const allAsOf = [summary.asOfISO, ...response.quotes.map((quote) => quote.asOfISO)].sort();
  return Object.freeze({
    ...summary,
    asOfISO: allAsOf[0] ?? summary.asOfISO,
    valuationQuality: additions.length === missing.length
      && additions.every((holding) => holding.valuationQuality === 'verified')
      && summary.valuationQuality === 'verified' ? 'verified' : 'mixed',
    holdings: Object.freeze([...summary.holdings, ...additions]),
    warnings: Object.freeze([...summary.warnings, ...response.warnings]),
  });
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Math.sign(value) * Number.EPSILON * Math.max(1, Math.abs(value))) * scale) / scale;
}

async function planFor(
  userId: string,
  summary: PortfolioSummary,
  policy: PortfolioAllocationPolicy,
): Promise<CostAwareRebalancePlan> {
  const base = computeRebalancePlan({
    totalValue: summary.totalValue,
    cashBalance: summary.cashBalance,
    holdings: summary.holdings,
    policy,
  });
  if (base.status === 'invalid') {
    return Object.freeze({
      ...base,
      items: Object.freeze(base.items.map((item) => Object.freeze({
        ...item,
        requestedTradeValue: item.tradeValue,
        optimizationDecision: 'not-required' as const,
        estimatedCosts: ZERO_ORDER_COSTS,
        estimatedCostBasis: 0,
        taxLotSnapshot: Object.freeze([]),
      }))),
      estimatedCosts: ZERO_ORDER_COSTS,
      estimatedTaxReserve: 0,
      optimizationStatus: 'invalid',
    });
  }

  const needsLots = base.items.some((item) => item.action === 'sell');
  const openLots = needsLots
    ? buildPortfolioOpenFifoLots(await listPortfolioTransactions(userId, summary.portfolio.id))
    : Object.freeze([]);
  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const optimization = optimizePortfolioOrders({
    mode: 'rebalance',
    cashBalance: summary.cashBalance,
    requiredCashReserve: Math.max(0, base.estimatedCashAfter),
    minTradeValue: policy.minTradeValue,
    policy: policy.costPolicy,
    candidates: base.items.map((item, priority) => Object.freeze({
      symbol: item.symbol,
      action: item.action,
      requestedTradeValue: item.tradeValue,
      ...(holdings.get(item.symbol)?.price ? { referencePrice: holdings.get(item.symbol)?.price } : {}),
      priority,
    })),
    openLots,
  });
  const optimized = new Map(optimization.orders.map((order) => [order.symbol, order]));
  const items = Object.freeze(base.items.map((item): CostAwareRebalancePlanItem => {
    const order = optimized.get(item.symbol);
    if (order) {
      return Object.freeze({
        ...item,
        action: order.action,
        requestedTradeValue: order.requestedTradeValue,
        tradeValue: order.tradeValue,
        optimizationDecision: order.optimizationDecision,
        estimatedCosts: order.estimatedCosts,
        estimatedCostBasis: order.estimatedCostBasis,
        taxLotSnapshot: order.taxLotSnapshot,
        estimatedQuantity: order.estimatedQuantity,
      });
    }
    const desiredValue = item.symbol === 'CASH' || !base.rebalanceNeeded
      ? 0
      : round(Math.abs(item.targetValue - item.currentValue), 2);
    const belowMinimum = desiredValue > 0 && desiredValue < policy.minTradeValue;
    return Object.freeze({
      ...item,
      requestedTradeValue: desiredValue,
      optimizationDecision: belowMinimum ? 'below-minimum' : 'not-required',
      estimatedCosts: ZERO_ORDER_COSTS,
      estimatedCostBasis: 0,
      taxLotSnapshot: Object.freeze([]),
    });
  }));
  const buyValue = round(items.reduce((sum, item) => sum + (item.action === 'buy' ? item.tradeValue : 0), 0), 2);
  const sellValue = round(items.reduce((sum, item) => sum + (item.action === 'sell' ? item.tradeValue : 0), 0), 2);
  return Object.freeze({
    ...base,
    status: base.status === 'available' && optimization.status !== 'invalid'
      ? 'available'
      : optimization.status === 'invalid' ? 'invalid' : 'partial',
    estimatedCashAfter: optimization.estimatedSpendableCashAfter,
    buyValue,
    sellValue,
    items,
    warnings: Object.freeze([...new Set([...base.warnings, ...optimization.warnings])]),
    estimatedCosts: optimization.estimatedCosts,
    estimatedTaxReserve: optimization.estimatedTaxReserve,
    optimizationStatus: optimization.status,
  });
}

function planSafetyReasons(summary: PortfolioSummary, plan: CostAwareRebalancePlan): readonly string[] {
  const reasons: string[] = [];
  const now = Date.now();
  if (summary.valuationQuality !== 'verified') reasons.push('모든 평가가격이 검증 상태여야 합니다.');
  if (plan.status !== 'available') reasons.push(...plan.warnings);
  if (plan.items.length > 500) reasons.push('한 계획에서 지원하는 최대 자산 수 500개를 초과했습니다.');
  if (!plan.rebalanceNeeded) reasons.push('현재 최대 편차가 설정한 임계치보다 작습니다.');
  if (plan.estimatedCashAfter < 0) reasons.push('제안 주문을 실행할 현금이 부족합니다.');
  if (!plan.items.some((item) => item.action !== 'hold')) reasons.push('최소 주문금액을 충족하는 제안 주문이 없습니다.');
  const holdingBySymbol = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  for (const item of plan.items.filter((entry) => entry.action !== 'hold')) {
    const holding = holdingBySymbol.get(item.symbol);
    const priceAt = new Date(holding?.provenance?.providerTimestamp ?? '').getTime();
    if (!holding?.price || !holding.provenance || holding.valuationQuality !== 'verified') {
      reasons.push(`${item.symbol} 검증 가격과 출처가 없습니다.`);
    } else if (!Number.isFinite(priceAt) || now - priceAt > PRICE_MAX_AGE_HOURS * HOUR_MS || priceAt - now > HOUR_MS) {
      reasons.push(`${item.symbol} 가격이 ${PRICE_MAX_AGE_HOURS}시간 유효 범위를 벗어났습니다.`);
    }
  }
  return Object.freeze([...new Set(reasons)]);
}

function workflowConflict(error: unknown, fallback: string): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new ApiError(409, 'REBALANCE_WORKFLOW_CONFLICT', message || fallback);
}

export async function generateRebalanceRun(
  userId: string,
  portfolioId: string,
  source: 'manual' | 'scheduled',
  idempotencyKey: string,
  requestId: string,
): Promise<Readonly<{ run: PortfolioRebalanceRun; created: boolean }> | null> {
  const requestHash = rebalanceRequestHash({ action: 'generate', portfolioId, source });
  const replay = await replayRebalanceRequest(userId, idempotencyKey, requestHash, 'created');
  if (replay) return Object.freeze({ run: replay, created: false });
  const policy = await getPortfolioAllocationPolicy(userId, portfolioId);
  if (!policy) {
    if (source === 'scheduled') return null;
    throw new ApiError(409, 'ALLOCATION_POLICY_REQUIRED', '먼저 목표배분 정책을 저장해 주세요.');
  }
  const summary = await buildTargetAwarePortfolioSummary(userId, portfolioId, policy, `${requestId}:summary`);
  const plan = await planFor(userId, summary, policy);
  const safetyReasons = planSafetyReasons(summary, plan);
  if (safetyReasons.length) {
    if (source === 'scheduled' && !plan.rebalanceNeeded) return null;
    if (source === 'scheduled') {
      logger.warn('rebalance.plan_skipped', { portfolioId, reasons: safetyReasons });
      return null;
    }
    throw new ApiError(409, 'REBALANCE_PLAN_UNSAFE', safetyReasons.join(' '));
  }

  const holdings = new Map(summary.holdings.map((holding) => [holding.symbol, holding]));
  const items = plan.items.map((item) => {
    const holding = holdings.get(item.symbol);
    return Object.freeze({
      ...item,
      currentQuantity: item.symbol === 'CASH' ? summary.cashBalance : holding?.quantity ?? 0,
      ...(holding?.price ? { referencePrice: holding.price } : {}),
      ...(holding?.provenance ? {
        priceAsOf: holding.provenance.providerTimestamp,
        provenance: holding.provenance,
      } : {}),
    });
  });
  const planHash = rebalanceRequestHash({
    portfolioId,
    portfolioUpdatedAt: summary.portfolio.updatedAt,
    policyUpdatedAt: policy.updatedAt,
    valuationAsOf: summary.asOfISO,
    totalValue: summary.totalValue,
    cashBalance: summary.cashBalance,
    targets: policy.targets,
    costPolicy: policy.costPolicy,
    items,
  });
  try {
    return await createPortfolioRebalanceRun(
      userId,
      idempotencyKey,
      requestHash,
      {
        portfolioId,
        source,
        planHash,
        policyUpdatedAt: policy.updatedAt,
        portfolioUpdatedAt: summary.portfolio.updatedAt,
        valuationAsOf: summary.asOfISO,
        valuationQuality: summary.valuationQuality,
        totalValue: summary.totalValue,
        cashBalance: summary.cashBalance,
        driftThresholdPct: policy.driftThresholdPct,
        minTradeValue: policy.minTradeValue,
        maxDriftPct: plan.maxDriftPct,
        estimatedCashAfter: plan.estimatedCashAfter,
        expiresAt: new Date(Date.now() + PLAN_VALID_HOURS * HOUR_MS).toISOString(),
        items,
      },
    );
  } catch (error) {
    workflowConflict(error, '리밸런싱 계획을 저장하지 못했습니다.');
  }
}

function approvalPriceMap(run: PortfolioRebalanceRun): ReadonlyMap<string, Readonly<{ price: number; priceAsOf: string }>> {
  const approved = [...run.audit].reverse().find((entry) => entry.event === 'approved');
  const raw = approved?.details.prices;
  if (!Array.isArray(raw)) return new Map();
  const entries = raw.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const symbol = typeof row.symbol === 'string' ? row.symbol : '';
    const price = Number(row.price);
    const priceAsOf = typeof row.priceAsOf === 'string' ? row.priceAsOf : '';
    return symbol && Number.isFinite(price) && price > 0 && priceAsOf
      ? [[symbol, Object.freeze({ price, priceAsOf })] as const]
      : [];
  });
  return new Map(entries);
}

async function currentAssessment(
  userId: string,
  run: PortfolioRebalanceRun,
  requestId: string,
  phase: 'approve' | 'execute',
) {
  const policy = await getPortfolioAllocationPolicy(userId, run.portfolioId);
  if (!policy) return Object.freeze({
    assessment: Object.freeze({ safe: false, maxPriceMovePct: 0, reasons: Object.freeze(['목표배분 정책이 삭제되었습니다.']) }),
    summary: null,
  });
  const summary = await buildTargetAwarePortfolioSummary(userId, run.portfolioId, policy, `${requestId}:revalidate`);
  const assessmentPolicy = run.costModelVersion === 0
    ? Object.freeze({ ...policy, costPolicy: LEGACY_COST_POLICY })
    : policy;
  const plan = await planFor(userId, summary, assessmentPolicy);
  const approvedPrices = phase === 'execute' ? approvalPriceMap(run) : new Map<string, { price: number; priceAsOf: string }>();
  const baselineRun: PortfolioRebalanceRun = phase === 'execute'
    ? Object.freeze({
      ...run,
      items: Object.freeze(run.items.map((item) => Object.freeze({
        ...item,
        referencePrice: approvedPrices.get(item.symbol)?.price,
      }))),
    })
    : run;
  const baseAssessment = assessRebalanceApproval({
    run: baselineRun,
    currentSummary: summary,
    currentPlan: plan,
    currentPolicyUpdatedAt: policy.updatedAt,
    maxPriceAgeHours: PRICE_MAX_AGE_HOURS,
    maxPriceMovePct: PRICE_MOVE_REAPPROVAL_PCT,
    phase,
  });
  const costPolicyChanged = run.costModelVersion === 1 && JSON.stringify(canonical(policy.costPolicy))
    !== JSON.stringify(canonical(run.costPolicySnapshot));
  const workflowReasons: string[] = [];
  const currentItems = new Map(plan.items.map((item) => [item.symbol, item]));
  if (run.items.length !== plan.items.length) workflowReasons.push('현재 목표배분 항목이 기존 계획과 다릅니다.');
  for (const item of run.items) {
    const current = currentItems.get(item.symbol);
    if (!current || current.action !== item.action) {
      workflowReasons.push(`${item.symbol} 제안 방향이 계획 생성 후 변경되었습니다.`);
    } else if (run.costModelVersion === 1
      && current.optimizationDecision !== item.optimizationDecision) {
      workflowReasons.push(`${item.symbol} 비용 최적화 판단이 계획 생성 후 변경되었습니다.`);
    }
  }
  const reasons = Object.freeze([...new Set([
    ...baseAssessment.reasons,
    ...workflowReasons,
    ...(costPolicyChanged ? ['주문 비용 정책이 계획 생성 후 변경되었습니다.'] : []),
  ])]);
  const assessment = Object.freeze({
    ...baseAssessment,
    safe: baseAssessment.safe && reasons.length === 0,
    reasons,
  });
  return Object.freeze({ assessment, summary });
}

async function expireForReapproval(
  userId: string,
  run: PortfolioRebalanceRun,
  reasons: readonly string[],
  idempotencyKey: string,
  requestHash: string,
): Promise<never> {
  const reason = `재승인 필요: ${reasons.join(' ')}`.slice(0, 500);
  try {
    await transitionPortfolioRebalanceRun(
      userId,
      run.id,
      'expired',
      reason,
      { reapprovalReasons: [...reasons] },
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    workflowConflict(error, reason);
  }
  throw new ApiError(409, 'REBALANCE_REAPPROVAL_REQUIRED', reason);
}

export async function approveRebalanceRun(
  userId: string,
  runId: string,
  idempotencyKey: string,
  requestId: string,
): Promise<PortfolioRebalanceRun> {
  const run = await getPortfolioRebalanceRun(userId, runId);
  if (!run) throw new ApiError(404, 'REBALANCE_NOT_FOUND', '리밸런싱 계획을 찾을 수 없습니다.');
  const requestHash = rebalanceRequestHash({ action: 'approve', runId });
  const replay = await replayRebalanceRequest(userId, idempotencyKey, requestHash, 'approved');
  if (replay) return replay;
  const validation = await currentAssessment(userId, run, requestId, 'approve');
  if (!validation.assessment.safe || !validation.summary) {
    return expireForReapproval(userId, run, validation.assessment.reasons, idempotencyKey, requestHash);
  }
  const holdings = new Map(validation.summary.holdings.map((holding) => [holding.symbol, holding]));
  const prices = run.items.filter((item) => item.action !== 'hold').map((item) => {
    const holding = holdings.get(item.symbol);
    return Object.freeze({
      symbol: item.symbol,
      price: holding?.price ?? 0,
      priceAsOf: holding?.provenance?.providerTimestamp ?? validation.summary?.asOfISO ?? '',
    });
  });
  try {
    return await transitionPortfolioRebalanceRun(
      userId,
      run.id,
      'approved',
      undefined,
      { prices, maxPriceMovePct: validation.assessment.maxPriceMovePct },
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    workflowConflict(error, '계획을 승인하지 못했습니다.');
  }
}

export async function rejectRebalanceRun(
  userId: string,
  runId: string,
  reason: string,
  idempotencyKey: string,
): Promise<PortfolioRebalanceRun> {
  const requestHash = rebalanceRequestHash({ action: 'reject', runId, reason });
  const replay = await replayRebalanceRequest(userId, idempotencyKey, requestHash, 'rejected');
  if (replay) return replay;
  try {
    return await transitionPortfolioRebalanceRun(
      userId,
      runId,
      'rejected',
      reason,
      undefined,
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    workflowConflict(error, '계획을 거절하지 못했습니다.');
  }
}

export async function executeRebalanceRun(
  userId: string,
  runId: string,
  fills: readonly PortfolioRebalanceExecutionLink[],
  idempotencyKey: string,
  requestId: string,
): Promise<PortfolioRebalanceRun> {
  const run = await getPortfolioRebalanceRun(userId, runId);
  if (!run) throw new ApiError(404, 'REBALANCE_NOT_FOUND', '리밸런싱 계획을 찾을 수 없습니다.');
  const requestHash = rebalanceRequestHash({ action: 'complete', runId, fills });
  const replay = await replayRebalanceRequest(userId, idempotencyKey, requestHash, 'completed');
  if (replay) return replay;
  const expected = run.items.filter((item) => item.action !== 'hold');
  if (fills.length !== expected.length || new Set(fills.map((fill) => fill.itemId)).size !== expected.length) {
    throw new ApiError(400, 'REBALANCE_FILLS_INCOMPLETE', '모든 제안 주문마다 정확히 하나의 실제 체결이 필요합니다.');
  }
  const expectedById = new Map(expected.map((item) => [item.id, item]));
  for (const fill of fills) {
    const item = expectedById.get(fill.itemId);
    if (!item) throw new ApiError(400, 'REBALANCE_FILL_UNKNOWN', '제안 계획에 없는 체결 항목입니다.');
    if (!item.estimatedQuantity || fill.quantity > item.estimatedQuantity + QUANTITY_EPSILON) {
      throw new ApiError(409, 'REBALANCE_QUANTITY_EXCEEDED', `${item.symbol} 실제 체결 수량이 승인된 제안 수량을 초과합니다.`);
    }
  }
  const validation = await currentAssessment(userId, run, requestId, 'execute');
  if (!validation.assessment.safe) {
    return expireForReapproval(userId, run, validation.assessment.reasons, idempotencyKey, requestHash);
  }
  const openLots = run.costModelVersion === 1
    ? buildPortfolioOpenFifoLots(await listPortfolioTransactions(userId, run.portfolioId))
    : Object.freeze([]);
  const computedFills: PortfolioComputedExecutionLink[] = [];
  const actualCostReasons: string[] = [];
  const approvedPrices = approvalPriceMap(run);
  for (const fill of fills) {
    const item = expectedById.get(fill.itemId) as PortfolioRebalanceRun['items'][number];
    if (!item.referencePrice || item.action === 'hold') {
      throw new ApiError(409, 'REBALANCE_FILL_UNSAFE', `${item.symbol} 승인 기준가격을 확인할 수 없습니다.`);
    }
    let costs: PortfolioOrderCostBreakdown;
    if (run.costModelVersion === 0) {
      costs = legacyActualCosts(item.action, fill);
    } else {
      try {
        costs = estimateActualPortfolioOrderCosts({
          symbol: item.symbol,
          action: item.action,
          quantity: fill.quantity,
          referencePrice: item.referencePrice,
          actualPrice: fill.price,
          actualCommission: fill.fees,
          policy: run.costPolicySnapshot,
          openLots,
        }).costs;
      } catch (error) {
        throw new ApiError(409, 'REBALANCE_FILL_UNSAFE', error instanceof Error ? error.message : '실제 체결 비용을 검증할 수 없습니다.');
      }
    }
    const economicCost = costs.commission
      + Math.max(0, costs.slippage)
      + costs.transactionTax
      + costs.capitalGainsTax;
    const actualNotional = fill.quantity * fill.price;
    const approvedPrice = approvedPrices.get(item.symbol)?.price;
    if (actualNotional + 1e-9 < run.minTradeValue) {
      actualCostReasons.push(`${item.symbol} 실제 주문금액이 최소 주문금액보다 작습니다.`);
    }
    if (Math.abs(fill.price / item.referencePrice - 1) * 100 > PRICE_MOVE_REAPPROVAL_PCT
      || (approvedPrice !== undefined
        && Math.abs(fill.price / approvedPrice - 1) * 100 > PRICE_MOVE_REAPPROVAL_PCT)) {
      actualCostReasons.push(`${item.symbol} 실제 체결가가 승인 가격 범위를 벗어났습니다.`);
    }
    const actualCostPct = actualNotional > 0 ? economicCost / actualNotional * 100 : Number.POSITIVE_INFINITY;
    if (run.costModelVersion === 1 && (actualNotional <= 0
      || economicCost * 100 - actualNotional * run.costPolicySnapshot.maxCostPct > 0.000001)) {
      actualCostReasons.push(`${item.symbol} 실제 체결 추정비용이 주문금액의 ${round(actualCostPct)}%로 상한을 초과했습니다.`);
    }
    computedFills.push(Object.freeze({ ...fill, actualCosts: costs }));
  }
  const actualExecutionCashAfter = (validation.summary?.cashBalance ?? run.cashBalance)
    + computedFills.reduce((sum, fill) => {
      const item = expectedById.get(fill.itemId);
      const notional = fill.quantity * fill.price;
      return sum + (item?.action === 'sell' ? notional - fill.fees : -(notional + fill.fees));
    }, 0);
  const actualTaxReserve = computedFills.reduce((sum, fill) => sum + fill.actualCosts.tax, 0);
  const requiredCashReserve = run.items.find((item) => item.symbol === 'CASH')?.targetValue ?? 0;
  if (actualExecutionCashAfter - actualTaxReserve < requiredCashReserve - 0.01) {
    actualCostReasons.push(`실제 체결 후 추정세금 준비금을 제외한 현금이 목표 현금 ${round(requiredCashReserve, 2)}달러보다 부족합니다.`);
  }
  if (actualCostReasons.length) {
    return expireForReapproval(userId, run, actualCostReasons, idempotencyKey, requestHash);
  }
  try {
    return await completePortfolioRebalanceRun(userId, runId, computedFills, idempotencyKey, requestHash);
  } catch (error) {
    workflowConflict(error, '실제 체결을 원장에 반영하지 못했습니다.');
  }
}

export interface RebalanceMonitorResult {
  readonly inspected: number;
  readonly created: number;
  readonly deduplicated: number;
  readonly skipped: number;
  readonly expired: number;
}

export async function monitorPortfolioRebalances(requestId: string): Promise<RebalanceMonitorResult> {
  const configured = Number.parseInt(process.env.REBALANCE_SCAN_LIMIT ?? '20', 10);
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(configured, 50)) : 20;
  const expired = await expirePortfolioRebalanceRuns(250);
  const targets = await listRebalanceScanTargets(limit);
  let created = 0;
  let deduplicated = 0;
  let skipped = 0;
  for (const target of targets) {
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    try {
      const result = await generateRebalanceRun(
        target.userId,
        target.portfolioId,
        'scheduled',
        `p7-scan:${target.portfolioId}:${bucket}`,
        `${requestId}:${target.portfolioId}`,
      );
      if (!result) skipped += 1;
      else if (result.created) created += 1;
      else deduplicated += 1;
    } catch (error) {
      skipped += 1;
      logger.warn('rebalance.scan_failed', {
        portfolioId: target.portfolioId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await markRebalanceScanAttempt(target.userId, target.portfolioId).catch((error: unknown) => {
        logger.warn('rebalance.scan_cursor_failed', {
          portfolioId: target.portfolioId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
  return Object.freeze({ inspected: targets.length, created, deduplicated, skipped, expired });
}
