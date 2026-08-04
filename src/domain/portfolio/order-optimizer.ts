import type {
  PortfolioOrderCostBreakdown,
  PortfolioOrderCostPolicy,
  PortfolioOrderOptimizationDecision,
  PortfolioTaxLotSlice,
} from '../../shared/api.js';
import type { PortfolioOpenFifoLot } from './ledger.js';

const CENTS_PER_USD = 100;
const QUANTITY_SCALE = 1_000_000_000_000;
const RATE_DECIMAL_SCALE = 10_000;
const BPS_DENOMINATOR = 10_000 * RATE_DECIMAL_SCALE;
const PCT_DENOMINATOR = 100 * RATE_DECIMAL_SCALE;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const SYMBOL_PATTERN = /^[A-Z0-9.:-]{1,20}$/;
const QUANTITY_EPSILON = 1e-9;

export interface PortfolioOrderCandidate {
  readonly symbol: string;
  readonly action: 'buy' | 'sell' | 'hold';
  /** Gross reference-price notional requested by the P7/P8 base plan. */
  readonly requestedTradeValue: number;
  readonly referencePrice?: number;
  /** Lower values are funded first. Equal priorities use symbol order. */
  readonly priority?: number;
}

export type PortfolioFifoLotSlice = PortfolioTaxLotSlice;

export interface PortfolioOptimizedOrder {
  readonly symbol: string;
  readonly requestedAction: PortfolioOrderCandidate['action'];
  readonly action: PortfolioOrderCandidate['action'];
  readonly requestedTradeValue: number;
  /** Optimized reference-price notional before estimated slippage. */
  readonly tradeValue: number;
  readonly optimizationDecision: PortfolioOrderOptimizationDecision;
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly estimatedCostPct: number;
  readonly estimatedCostBasis: number;
  readonly estimatedQuantity?: number;
  readonly taxLotSnapshot: readonly PortfolioTaxLotSlice[];
}

export interface PortfolioActualOrderCostInput {
  readonly symbol: string;
  readonly action: 'buy' | 'sell';
  readonly quantity: number;
  readonly referencePrice: number;
  readonly actualPrice: number;
  /** User-entered actual commission/fees recorded by the ledger. */
  readonly actualCommission: number;
  readonly policy: PortfolioOrderCostPolicy;
  readonly openLots?: readonly PortfolioOpenFifoLot[];
}

export interface PortfolioActualOrderCostEstimate {
  readonly costs: PortfolioOrderCostBreakdown;
  readonly estimatedCostBasis: number;
  readonly fifoLots: readonly PortfolioTaxLotSlice[];
}

export interface PortfolioOrderOptimizationInput {
  readonly mode: 'rebalance' | 'contribution';
  readonly cashBalance: number;
  /** Cash that costs and optimized buys may not consume. */
  readonly requiredCashReserve: number;
  readonly minTradeValue: number;
  readonly policy: PortfolioOrderCostPolicy;
  readonly candidates: readonly PortfolioOrderCandidate[];
  readonly openLots?: readonly PortfolioOpenFifoLot[];
}

export interface PortfolioOrderOptimizationResult {
  readonly status: 'available' | 'partial' | 'invalid';
  readonly mode: PortfolioOrderOptimizationInput['mode'];
  readonly cashBalance: number;
  readonly requiredCashReserve: number;
  readonly estimatedExecutionCashAfter: number;
  readonly estimatedTaxReserve: number;
  readonly estimatedSpendableCashAfter: number;
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly orders: readonly PortfolioOptimizedOrder[];
  readonly warnings: readonly string[];
}

interface NormalizedPolicy {
  readonly fixedCommissionCents: bigint;
  readonly commissionBps: bigint;
  readonly buySlippageBps: bigint;
  readonly sellSlippageBps: bigint;
  readonly sellTransactionTaxBps: bigint;
  readonly capitalGainsTaxPct: bigint;
  readonly maxCostPct: bigint;
}

interface NormalizedCandidate {
  readonly symbol: string;
  readonly action: PortfolioOrderCandidate['action'];
  readonly requestedCents: bigint;
  readonly referencePrice?: number;
  readonly priority: number;
}

interface CostCents {
  readonly commission: bigint;
  readonly slippage: bigint;
  readonly transactionTax: bigint;
  readonly capitalGainsTax: bigint;
  readonly taxableGain: bigint;
  readonly total: bigint;
  readonly netCashEffect: bigint;
}

interface FifoSliceCents {
  readonly transactionId: string;
  readonly acquiredAt: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly costBasisCents: bigint;
}

interface EvaluatedOrder {
  readonly candidate: NormalizedCandidate;
  readonly action: PortfolioOrderCandidate['action'];
  readonly tradeCents: bigint;
  readonly decision: PortfolioOrderOptimizationDecision;
  readonly quantity?: number;
  readonly costs: CostCents;
  readonly costBasisCents: bigint;
  readonly fifoLots: readonly FifoSliceCents[];
  readonly rejectedCostPct?: number;
}

const ZERO_COSTS: CostCents = Object.freeze({
  commission: 0n,
  slippage: 0n,
  transactionTax: 0n,
  capitalGainsTax: 0n,
  taxableGain: 0n,
  total: 0n,
  netCashEffect: 0n,
});

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Math.sign(value) * Number.EPSILON * Math.max(1, Math.abs(value))) * scale) / scale;
}

function roundQuantity(value: number): number {
  return Math.floor((value + Number.EPSILON * Math.max(1, value)) * QUANTITY_SCALE) / QUANTITY_SCALE;
}

function toCents(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.round((value + Number.EPSILON * Math.max(1, value)) * CENTS_PER_USD);
  return Number.isSafeInteger(cents) ? BigInt(cents) : null;
}

function floorToCents(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.floor((value + Number.EPSILON * Math.max(1, value)) * CENTS_PER_USD);
  return Number.isSafeInteger(cents) ? BigInt(cents) : null;
}

function ceilToCents(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.ceil((value - Number.EPSILON * Math.max(1, value)) * CENTS_PER_USD);
  return Number.isSafeInteger(cents) ? BigInt(cents) : null;
}

function signedCeilToCents(value: number): bigint | null {
  if (!Number.isFinite(value)) return null;
  const cents = Math.ceil((value - Number.EPSILON * Math.max(1, Math.abs(value))) * CENTS_PER_USD);
  return Number.isSafeInteger(cents) ? BigInt(cents) : null;
}

function fromCents(cents: bigint): number {
  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
    throw new RangeError('Monetary result exceeds the supported safe-cent range.');
  }
  return Number(cents) / CENTS_PER_USD;
}

function rateUnits(value: number, max: number): bigint | null {
  if (!Number.isFinite(value) || value < 0 || value > max) return null;
  const units = Math.round(value * RATE_DECIMAL_SCALE);
  return Number.isSafeInteger(units) ? BigInt(units) : null;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

function ceilRate(amount: bigint, rate: bigint, denominator: number): bigint {
  return amount <= 0n || rate <= 0n ? 0n : ceilDiv(amount * rate, BigInt(denominator));
}

function costPct(cost: bigint, notional: bigint): number {
  return notional > 0n ? round(Number(cost * 100_000_000n / notional) / 1_000_000) : 0;
}

function withinCostLimit(cost: bigint, notional: bigint, policy: NormalizedPolicy): boolean {
  return notional > 0n && cost * BigInt(PCT_DENOMINATOR) <= notional * policy.maxCostPct;
}

function commissionCents(executionNotional: bigint, policy: NormalizedPolicy): bigint {
  if (executionNotional <= 0n) return 0n;
  return policy.fixedCommissionCents
    + ceilRate(executionNotional, policy.commissionBps, BPS_DENOMINATOR);
}

function buyCosts(referenceNotional: bigint, policy: NormalizedPolicy): CostCents {
  if (referenceNotional <= 0n) return ZERO_COSTS;
  const slippage = ceilRate(referenceNotional, policy.buySlippageBps, BPS_DENOMINATOR);
  const executionNotional = referenceNotional + slippage;
  const commission = commissionCents(executionNotional, policy);
  return Object.freeze({
    commission,
    slippage,
    transactionTax: 0n,
    capitalGainsTax: 0n,
    taxableGain: 0n,
    total: commission + slippage,
    netCashEffect: -(executionNotional + commission),
  });
}

function selectFifoLots(
  lots: readonly PortfolioOpenFifoLot[],
  symbol: string,
  requestedQuantity: number,
): Readonly<{ valid: boolean; slices: readonly FifoSliceCents[]; costBasisCents: bigint }> {
  const candidates = lots.filter((lot) => lot.symbol.trim().toUpperCase() === symbol);
  let remaining = requestedQuantity;
  const slices: FifoSliceCents[] = [];
  let costBasisCents = 0n;

  for (const lot of candidates) {
    if (!lot.transactionId || !Number.isFinite(new Date(lot.acquiredAt).getTime())
      || !Number.isFinite(lot.quantity) || lot.quantity <= 0
      || !Number.isFinite(lot.unitCost) || lot.unitCost < 0) {
      return Object.freeze({ valid: false, slices: Object.freeze([]), costBasisCents: 0n });
    }
    if (remaining <= QUANTITY_EPSILON) break;
    const consumed = roundQuantity(Math.min(remaining, lot.quantity));
    const sliceBasis = floorToCents(consumed * lot.unitCost);
    if (consumed <= 0 || sliceBasis === null) {
      return Object.freeze({ valid: false, slices: Object.freeze([]), costBasisCents: 0n });
    }
    slices.push(Object.freeze({
      transactionId: lot.transactionId,
      acquiredAt: lot.acquiredAt,
      quantity: consumed,
      unitCost: lot.unitCost,
      costBasisCents: sliceBasis,
    }));
    costBasisCents += sliceBasis;
    remaining = roundQuantity(remaining - consumed);
  }

  return Object.freeze({
    valid: remaining <= QUANTITY_EPSILON,
    slices: Object.freeze(slices),
    costBasisCents,
  });
}

function sellCosts(
  referenceNotional: bigint,
  costBasisCents: bigint,
  policy: NormalizedPolicy,
): CostCents {
  const slippage = ceilRate(referenceNotional, policy.sellSlippageBps, BPS_DENOMINATOR);
  const executionNotional = referenceNotional > slippage ? referenceNotional - slippage : 0n;
  const commission = commissionCents(executionNotional, policy);
  const transactionTax = ceilRate(executionNotional, policy.sellTransactionTaxBps, BPS_DENOMINATOR);
  const taxableGain = executionNotional > commission + transactionTax + costBasisCents
    ? executionNotional - commission - transactionTax - costBasisCents
    : 0n;
  const capitalGainsTax = ceilRate(taxableGain, policy.capitalGainsTaxPct, PCT_DENOMINATOR);
  return Object.freeze({
    commission,
    slippage,
    transactionTax,
    capitalGainsTax,
    taxableGain,
    total: commission + slippage + transactionTax + capitalGainsTax,
    // Estimated taxes remain a reserve until the user records a real payment.
    netCashEffect: executionNotional - commission,
  });
}

function zeroOrder(
  candidate: NormalizedCandidate,
  decision: PortfolioOrderOptimizationDecision,
  rejectedCostPct?: number,
): EvaluatedOrder {
  return Object.freeze({
    candidate,
    action: 'hold',
    tradeCents: 0n,
    decision,
    costs: ZERO_COSTS,
    costBasisCents: 0n,
    fifoLots: Object.freeze([]),
    ...(rejectedCostPct === undefined ? {} : { rejectedCostPct }),
  });
}

function normalizePolicy(policy: PortfolioOrderCostPolicy, warnings: string[]): NormalizedPolicy | null {
  const fixedCommissionCents = toCents(policy.commissionFixedUsd);
  const commissionBps = rateUnits(policy.commissionBps, 10_000);
  const buySlippageBps = rateUnits(policy.buySlippageBps, 10_000);
  const sellSlippageBps = rateUnits(policy.sellSlippageBps, 10_000);
  const sellTransactionTaxBps = rateUnits(policy.sellTransactionTaxBps, 10_000);
  const capitalGainsTaxPct = rateUnits(policy.capitalGainsTaxPct, 100);
  const maxCostPct = rateUnits(policy.maxCostPct, 100);
  if (policy.taxLotMethod !== 'fifo') warnings.push('Tax-lot method must be FIFO.');
  if (fixedCommissionCents === null) warnings.push('Fixed commission must be a non-negative safe-cent amount.');
  if ([commissionBps, buySlippageBps, sellSlippageBps, sellTransactionTaxBps].some((value) => value === null)) {
    warnings.push('Commission, slippage and transaction-tax rates must be between 0 and 10000 bps.');
  }
  if (capitalGainsTaxPct === null || maxCostPct === null) {
    warnings.push('Capital-gains tax and maximum cost rates must be between 0% and 100%.');
  }
  if (warnings.length || fixedCommissionCents === null || commissionBps === null
    || buySlippageBps === null || sellSlippageBps === null || sellTransactionTaxBps === null
    || capitalGainsTaxPct === null || maxCostPct === null) return null;
  return Object.freeze({
    fixedCommissionCents,
    commissionBps,
    buySlippageBps,
    sellSlippageBps,
    sellTransactionTaxBps,
    capitalGainsTaxPct,
    maxCostPct,
  });
}

function normalizeCandidates(
  candidates: readonly PortfolioOrderCandidate[],
  warnings: string[],
): readonly NormalizedCandidate[] {
  if (!candidates.length) warnings.push('At least one order candidate is required.');
  const symbols = new Set<string>();
  const normalized = candidates.flatMap((candidate): readonly NormalizedCandidate[] => {
    const symbol = candidate.symbol.trim().toUpperCase();
    const requestedCents = toCents(candidate.requestedTradeValue);
    const priority = candidate.priority ?? 0;
    if (!SYMBOL_PATTERN.test(symbol)) warnings.push('Every order candidate must have a valid symbol.');
    if (symbols.has(symbol)) warnings.push(`${symbol || 'Unknown symbol'} is duplicated.`);
    symbols.add(symbol);
    if (requestedCents === null) warnings.push(`${symbol || 'Unknown symbol'} has an invalid requested trade value.`);
    if (!Number.isInteger(priority) || priority < 0 || priority > 1_000_000) {
      warnings.push(`${symbol || 'Unknown symbol'} has an invalid priority.`);
    }
    if (candidate.action === 'hold' && requestedCents !== 0n) warnings.push(`${symbol} hold candidate must request zero value.`);
    if (candidate.action !== 'hold' && (!candidate.referencePrice || !Number.isFinite(candidate.referencePrice) || candidate.referencePrice <= 0)) {
      warnings.push(`${symbol} actionable candidate requires a positive reference price.`);
    }
    if (!symbol || requestedCents === null || !Number.isInteger(priority) || priority < 0 || priority > 1_000_000) return [];
    return [Object.freeze({
      symbol,
      action: candidate.action,
      requestedCents,
      ...(candidate.referencePrice === undefined ? {} : { referencePrice: candidate.referencePrice }),
      priority,
    })];
  });
  return Object.freeze(normalized);
}

function publicCosts(costs: CostCents): PortfolioOrderCostBreakdown {
  const transactionTax = fromCents(costs.transactionTax);
  const capitalGainsTax = fromCents(costs.capitalGainsTax);
  return Object.freeze({
    commission: fromCents(costs.commission),
    slippage: fromCents(costs.slippage),
    transactionTax,
    capitalGainsTax,
    tax: fromCents(costs.transactionTax + costs.capitalGainsTax),
    taxableGain: fromCents(costs.taxableGain),
    total: fromCents(costs.total),
    netCashEffect: fromCents(costs.netCashEffect),
  });
}

function publicOrder(order: EvaluatedOrder): PortfolioOptimizedOrder {
  return Object.freeze({
    symbol: order.candidate.symbol,
    requestedAction: order.candidate.action,
    action: order.action,
    requestedTradeValue: fromCents(order.candidate.requestedCents),
    tradeValue: fromCents(order.tradeCents),
    optimizationDecision: order.decision,
    estimatedCosts: publicCosts(order.costs),
    estimatedCostPct: order.rejectedCostPct ?? costPct(order.costs.total, order.tradeCents),
    estimatedCostBasis: fromCents(order.costBasisCents),
    ...(order.quantity === undefined ? {} : { estimatedQuantity: order.quantity }),
    taxLotSnapshot: Object.freeze(order.fifoLots.map((lot) => Object.freeze({
      transactionId: lot.transactionId,
      acquiredAt: lot.acquiredAt,
      quantity: lot.quantity,
      unitCost: lot.unitCost,
      costBasis: fromCents(lot.costBasisCents),
    }))),
  });
}

function aggregateCosts(orders: readonly EvaluatedOrder[]): CostCents {
  return orders.reduce((sum, order): CostCents => Object.freeze({
    commission: sum.commission + order.costs.commission,
    slippage: sum.slippage + order.costs.slippage,
    transactionTax: sum.transactionTax + order.costs.transactionTax,
    capitalGainsTax: sum.capitalGainsTax + order.costs.capitalGainsTax,
    taxableGain: sum.taxableGain + order.costs.taxableGain,
    total: sum.total + order.costs.total,
    netCashEffect: sum.netCashEffect + order.costs.netCashEffect,
  }), ZERO_COSTS);
}

function invalidResult(
  input: PortfolioOrderOptimizationInput,
  warnings: readonly string[],
): PortfolioOrderOptimizationResult {
  const cash = toCents(input.cashBalance) ?? 0n;
  const reserve = toCents(input.requiredCashReserve) ?? 0n;
  return Object.freeze({
    status: 'invalid',
    mode: input.mode,
    cashBalance: fromCents(cash),
    requiredCashReserve: fromCents(reserve),
    estimatedExecutionCashAfter: fromCents(cash),
    estimatedTaxReserve: 0,
    estimatedSpendableCashAfter: fromCents(cash),
    estimatedCosts: publicCosts(ZERO_COSTS),
    orders: Object.freeze([]),
    warnings: unique(warnings),
  });
}

function maxAffordableBuyNotional(
  desiredCents: bigint,
  availableCents: bigint,
  policy: NormalizedPolicy,
): bigint {
  let lower = 0n;
  let upper = desiredCents;
  while (lower < upper) {
    const middle = lower + (upper - lower + 1n) / 2n;
    const debit = -buyCosts(middle, policy).netCashEffect;
    if (debit <= availableCents) lower = middle;
    else upper = middle - 1n;
  }
  return lower;
}

/**
 * Recomputes the economic evidence for a user-entered fill. Actual ledger cash
 * changes include only actual notional and the user-entered commission. Tax
 * values remain estimates/reserves and are never presented as paid tax.
 */
export function estimateActualPortfolioOrderCosts(
  input: PortfolioActualOrderCostInput,
): PortfolioActualOrderCostEstimate {
  const symbol = input.symbol.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) throw new TypeError('Actual order requires a valid symbol.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new TypeError('Actual order quantity must be positive and finite.');
  }
  if (!Number.isFinite(input.referencePrice) || input.referencePrice <= 0
    || !Number.isFinite(input.actualPrice) || input.actualPrice <= 0) {
    throw new TypeError('Actual and reference prices must be positive and finite.');
  }
  const actualCommission = ceilToCents(input.actualCommission);
  if (actualCommission === null) throw new TypeError('Actual commission must be a non-negative safe-cent amount.');
  const policyWarnings: string[] = [];
  const policy = normalizePolicy(input.policy, policyWarnings);
  if (!policy) throw new TypeError(policyWarnings.join(' '));

  const rawActualNotional = input.quantity * input.actualPrice;
  const actualNotional = input.action === 'buy'
    ? ceilToCents(rawActualNotional)
    : floorToCents(rawActualNotional);
  const rawSlippage = input.action === 'buy'
    ? (input.actualPrice - input.referencePrice) * input.quantity
    : (input.referencePrice - input.actualPrice) * input.quantity;
  const slippage = signedCeilToCents(rawSlippage);
  if (actualNotional === null || slippage === null) {
    throw new RangeError('Actual order exceeds the supported safe-cent range.');
  }

  if (input.action === 'buy') {
    const costs: CostCents = Object.freeze({
      commission: actualCommission,
      slippage,
      transactionTax: 0n,
      capitalGainsTax: 0n,
      taxableGain: 0n,
      total: actualCommission + slippage,
      netCashEffect: -(actualNotional + actualCommission),
    });
    return Object.freeze({
      costs: publicCosts(costs),
      estimatedCostBasis: 0,
      fifoLots: Object.freeze([]),
    });
  }

  const fifo = selectFifoLots(input.openLots ?? [], symbol, roundQuantity(input.quantity));
  if (!fifo.valid) throw new RangeError(`${symbol} does not have enough valid FIFO lots for the actual sale.`);
  const transactionTax = ceilRate(actualNotional, policy.sellTransactionTaxBps, BPS_DENOMINATOR);
  const taxableGain = actualNotional > actualCommission + transactionTax + fifo.costBasisCents
    ? actualNotional - actualCommission - transactionTax - fifo.costBasisCents
    : 0n;
  const capitalGainsTax = ceilRate(taxableGain, policy.capitalGainsTaxPct, PCT_DENOMINATOR);
  const costs: CostCents = Object.freeze({
    commission: actualCommission,
    slippage,
    transactionTax,
    capitalGainsTax,
    taxableGain,
    total: actualCommission + slippage + transactionTax + capitalGainsTax,
    netCashEffect: actualNotional - actualCommission,
  });
  return Object.freeze({
    costs: publicCosts(costs),
    estimatedCostBasis: fromCents(fifo.costBasisCents),
    fifoLots: Object.freeze(fifo.slices.map((lot) => Object.freeze({
      transactionId: lot.transactionId,
      acquiredAt: lot.acquiredAt,
      quantity: lot.quantity,
      unitCost: lot.unitCost,
      costBasis: fromCents(lot.costBasisCents),
    }))),
  });
}

function optimizeValidated(
  input: PortfolioOrderOptimizationInput,
  cashCents: bigint,
  reserveCents: bigint,
  minTradeCents: bigint,
  policy: NormalizedPolicy,
  candidates: readonly NormalizedCandidate[],
): PortfolioOrderOptimizationResult {
  const warnings: string[] = [];
  const orders: EvaluatedOrder[] = [];
  let executionCash = cashCents;
  let taxReserve = 0n;
  const ordered = [...candidates].sort((left, right) => {
    const actionOrder = (action: NormalizedCandidate['action']) => action === 'sell' ? 0 : action === 'buy' ? 1 : 2;
    return actionOrder(left.action) - actionOrder(right.action)
      || left.priority - right.priority
      || left.symbol.localeCompare(right.symbol);
  });

  for (const candidate of ordered.filter((entry) => entry.action === 'sell')) {
    if (candidate.requestedCents <= 0n) {
      orders.push(zeroOrder(candidate, 'not-required'));
      continue;
    }
    if (candidate.requestedCents < minTradeCents) {
      orders.push(zeroOrder(candidate, 'below-minimum'));
      warnings.push(`${candidate.symbol} sell was below the minimum trade value.`);
      continue;
    }
    const quantity = roundQuantity(fromCents(candidate.requestedCents) / (candidate.referencePrice as number));
    if (!(quantity > 0)) {
      orders.push(zeroOrder(candidate, 'below-minimum'));
      continue;
    }
    const fifo = selectFifoLots(input.openLots ?? [], candidate.symbol, quantity);
    const needsTaxLots = policy.capitalGainsTaxPct > 0n;
    if (!fifo.valid && needsTaxLots) {
      orders.push(zeroOrder(candidate, 'invalid-tax-lots'));
      warnings.push(`${candidate.symbol} does not have enough valid FIFO lots for its estimated sale.`);
      continue;
    }
    const usableFifo = fifo.valid ? fifo : Object.freeze({ slices: Object.freeze([]), costBasisCents: 0n });
    const costs = sellCosts(candidate.requestedCents, usableFifo.costBasisCents, policy);
    const rejectedPct = costPct(costs.total, candidate.requestedCents);
    if (costs.netCashEffect <= 0n || !withinCostLimit(costs.total, candidate.requestedCents, policy)) {
      orders.push(zeroOrder(candidate, 'cost-inefficient', rejectedPct));
      warnings.push(`${candidate.symbol} sell exceeded the maximum estimated cost percentage.`);
      continue;
    }
    orders.push(Object.freeze({
      candidate,
      action: 'sell',
      tradeCents: candidate.requestedCents,
      decision: 'execute',
      quantity,
      costs,
      costBasisCents: usableFifo.costBasisCents,
      fifoLots: usableFifo.slices,
    }));
    executionCash += costs.netCashEffect;
    taxReserve += costs.transactionTax + costs.capitalGainsTax;
  }

  for (const candidate of ordered.filter((entry) => entry.action === 'buy')) {
    if (candidate.requestedCents <= 0n) {
      orders.push(zeroOrder(candidate, 'not-required'));
      continue;
    }
    if (candidate.requestedCents < minTradeCents) {
      orders.push(zeroOrder(candidate, 'below-minimum'));
      warnings.push(`${candidate.symbol} buy was below the minimum trade value.`);
      continue;
    }
    const available = executionCash > reserveCents + taxReserve
      ? executionCash - reserveCents - taxReserve
      : 0n;
    const affordable = maxAffordableBuyNotional(candidate.requestedCents, available, policy);
    if (affordable < minTradeCents || affordable <= 0n) {
      orders.push(zeroOrder(candidate, 'cash-limited'));
      warnings.push(`${candidate.symbol} buy could not preserve the required cash and tax reserves.`);
      continue;
    }
    const costs = buyCosts(affordable, policy);
    const rejectedPct = costPct(costs.total, affordable);
    if (!withinCostLimit(costs.total, affordable, policy)) {
      orders.push(zeroOrder(candidate, 'cost-inefficient', rejectedPct));
      warnings.push(`${candidate.symbol} buy exceeded the maximum estimated cost percentage.`);
      continue;
    }
    const quantity = roundQuantity(fromCents(affordable) / (candidate.referencePrice as number));
    if (!(quantity > 0)) {
      orders.push(zeroOrder(candidate, 'below-minimum'));
      continue;
    }
    const decision: PortfolioOrderOptimizationDecision = affordable < candidate.requestedCents
      ? 'cash-limited'
      : 'execute';
    orders.push(Object.freeze({
      candidate,
      action: 'buy',
      tradeCents: affordable,
      decision,
      quantity,
      costs,
      costBasisCents: 0n,
      fifoLots: Object.freeze([]),
    }));
    executionCash += costs.netCashEffect;
  }

  for (const candidate of ordered.filter((entry) => entry.action === 'hold')) {
    orders.push(zeroOrder(candidate, 'not-required'));
  }

  const estimatedSpendableCashAfter = executionCash - taxReserve;
  if (executionCash < 0n || estimatedSpendableCashAfter < reserveCents) {
    throw new RangeError('Order optimization violated its cash-reserve invariant.');
  }
  const totals = aggregateCosts(orders);
  const publicOrders = Object.freeze(orders.map(publicOrder));
  const partial = publicOrders.some((order) => !['execute', 'not-required'].includes(order.optimizationDecision));
  return Object.freeze({
    status: partial ? 'partial' : 'available',
    mode: input.mode,
    cashBalance: fromCents(cashCents),
    requiredCashReserve: fromCents(reserveCents),
    estimatedExecutionCashAfter: fromCents(executionCash),
    estimatedTaxReserve: fromCents(taxReserve),
    estimatedSpendableCashAfter: fromCents(estimatedSpendableCashAfter),
    estimatedCosts: publicCosts(totals),
    orders: publicOrders,
    warnings: unique(warnings),
  });
}

/**
 * Applies deterministic, conservative execution costs to P7/P8 base orders.
 * Sells are evaluated before buys. Every monetary estimate is represented as
 * integer cents internally; positive costs round up to avoid spending a penny
 * that the plan has not reserved.
 */
export function optimizePortfolioOrders(input: PortfolioOrderOptimizationInput): PortfolioOrderOptimizationResult {
  const warnings: string[] = [];
  const cashCents = toCents(input.cashBalance);
  const reserveCents = toCents(input.requiredCashReserve);
  const minTradeCents = toCents(input.minTradeValue);
  if (cashCents === null) warnings.push('Cash balance must be a non-negative safe-cent amount.');
  if (reserveCents === null) warnings.push('Required cash reserve must be a non-negative safe-cent amount.');
  if (minTradeCents === null) warnings.push('Minimum trade value must be a non-negative safe-cent amount.');
  const policy = normalizePolicy(input.policy, warnings);
  const candidates = normalizeCandidates(input.candidates, warnings);
  if (warnings.length || cashCents === null || reserveCents === null || minTradeCents === null || !policy) {
    return invalidResult(input, warnings);
  }
  try {
    return optimizeValidated(input, cashCents, reserveCents, minTradeCents, policy, candidates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order optimization exceeded its supported range.';
    return invalidResult(input, [message]);
  }
}
