import { describe, expect, it } from 'vitest';
import type { PortfolioOrderCostPolicy } from '@/shared/api';
import type { PortfolioOpenFifoLot } from './ledger.js';
import {
  estimateActualPortfolioOrderCosts,
  optimizePortfolioOrders,
  type PortfolioOrderCandidate,
} from './order-optimizer.js';

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

const FIFO_LOTS: readonly PortfolioOpenFifoLot[] = Object.freeze([
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

describe('optimizePortfolioOrders', () => {
  it('keeps zero-cost P7 trade values and funds buys with sells first', () => {
    const result = optimizePortfolioOrders({
      mode: 'rebalance',
      cashBalance: 0,
      requiredCashReserve: 0,
      minTradeValue: 10,
      policy: policy(),
      openLots: FIFO_LOTS,
      candidates: [
        { symbol: 'BBB', action: 'buy', requestedTradeValue: 100, referencePrice: 10 },
        { symbol: 'AAA', action: 'sell', requestedTradeValue: 100, referencePrice: 20 },
      ],
    });

    expect(result.status).toBe('available');
    expect(result.orders.map((order) => ({
      symbol: order.symbol,
      action: order.action,
      requestedTradeValue: order.requestedTradeValue,
      tradeValue: order.tradeValue,
      decision: order.optimizationDecision,
    }))).toEqual([
      { symbol: 'AAA', action: 'sell', requestedTradeValue: 100, tradeValue: 100, decision: 'execute' },
      { symbol: 'BBB', action: 'buy', requestedTradeValue: 100, tradeValue: 100, decision: 'execute' },
    ]);
    expect(result.estimatedCosts.total).toBe(0);
    expect(result.estimatedExecutionCashAfter).toBe(0);
    expect(result.estimatedSpendableCashAfter).toBe(0);
  });

  it('uses conservative cent rounding and binary search to fit a contribution envelope', () => {
    const result = optimizePortfolioOrders({
      mode: 'contribution',
      cashBalance: 100,
      requiredCashReserve: 0,
      minTradeValue: 1,
      policy: policy({ commissionFixedUsd: 0.01, commissionBps: 1, buySlippageBps: 5, maxCostPct: 10 }),
      candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: 100, referencePrice: 10 }],
    });
    const order = result.orders[0]!;

    expect(order.tradeValue).toBe(99.93);
    expect(order.optimizationDecision).toBe('cash-limited');
    expect(order.estimatedCosts).toMatchObject({ commission: 0.02, slippage: 0.05, total: 0.07, netCashEffect: -100 });
    expect(result.estimatedExecutionCashAfter).toBe(0);
    expect(result.status).toBe('partial');
  });

  it('never lets fixed costs consume the required cash reserve', () => {
    const result = optimizePortfolioOrders({
      mode: 'contribution',
      cashBalance: 100,
      requiredCashReserve: 20,
      minTradeValue: 1,
      policy: policy({ commissionFixedUsd: 1, maxCostPct: 100 }),
      candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: 100, referencePrice: 10 }],
    });

    expect(result.orders[0]).toMatchObject({ tradeValue: 79, optimizationDecision: 'cash-limited' });
    expect(result.orders[0]?.estimatedCosts).toMatchObject({ commission: 1, netCashEffect: -80 });
    expect(result.estimatedExecutionCashAfter).toBe(20);
    expect(result.estimatedSpendableCashAfter).toBe(20);
  });

  it('estimates positive FIFO gains and reserves capital-gains tax without marking it paid', () => {
    const result = optimizePortfolioOrders({
      mode: 'rebalance',
      cashBalance: 0,
      requiredCashReserve: 0,
      minTradeValue: 10,
      policy: policy({ commissionFixedUsd: 15, capitalGainsTaxPct: 20, maxCostPct: 100 }),
      openLots: FIFO_LOTS,
      candidates: [{ symbol: 'AAA', action: 'sell', requestedTradeValue: 4_500, referencePrice: 300 }],
    });
    const order = result.orders[0]!;

    expect(order.estimatedQuantity).toBe(15);
    expect(order.estimatedCostBasis).toBe(2_010);
    expect(order.taxLotSnapshot).toEqual([
      expect.objectContaining({ transactionId: 'buy-1', quantity: 10, costBasis: 1_010 }),
      expect.objectContaining({ transactionId: 'buy-2', quantity: 5, costBasis: 1_000 }),
    ]);
    expect(order.estimatedCosts).toEqual({
      commission: 15,
      slippage: 0,
      transactionTax: 0,
      capitalGainsTax: 495,
      tax: 495,
      taxableGain: 2_475,
      total: 510,
      netCashEffect: 4_485,
    });
    expect(result.estimatedExecutionCashAfter).toBe(4_485);
    expect(result.estimatedTaxReserve).toBe(495);
    expect(result.estimatedSpendableCashAfter).toBe(3_990);
  });

  it('rounds sell slippage and transaction tax up to cents and reserves both taxes', () => {
    const result = optimizePortfolioOrders({
      mode: 'rebalance',
      cashBalance: 0,
      requiredCashReserve: 0,
      minTradeValue: 10,
      policy: policy({ sellSlippageBps: 10, sellTransactionTaxBps: 20, maxCostPct: 100 }),
      openLots: [Object.freeze({
        transactionId: 'lot', symbol: 'AAA', acquiredAt: '2025-01-01T00:00:00.000Z', quantity: 10, unitCost: 50,
      })],
      candidates: [{ symbol: 'AAA', action: 'sell', requestedTradeValue: 1_000, referencePrice: 100 }],
    });

    expect(result.orders[0]?.estimatedCosts).toMatchObject({
      slippage: 1,
      transactionTax: 2,
      taxableGain: 497,
      total: 3,
      netCashEffect: 999,
    });
    expect(result.estimatedExecutionCashAfter).toBe(999);
    expect(result.estimatedTaxReserve).toBe(2);
    expect(result.estimatedSpendableCashAfter).toBe(997);
  });

  it('filters uneconomic orders without charging their rejected costs', () => {
    const result = optimizePortfolioOrders({
      mode: 'contribution',
      cashBalance: 10,
      requiredCashReserve: 0,
      minTradeValue: 0.01,
      policy: policy({ commissionFixedUsd: 0.1, maxCostPct: 5 }),
      candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: 1, referencePrice: 1 }],
    });

    expect(result.orders[0]).toMatchObject({
      action: 'hold',
      tradeValue: 0,
      optimizationDecision: 'cost-inefficient',
      estimatedCostPct: 10,
    });
    expect(result.orders[0]?.estimatedCosts.total).toBe(0);
    expect(result.estimatedExecutionCashAfter).toBe(10);
  });

  it('blocks taxable sales when FIFO evidence is incomplete', () => {
    const result = optimizePortfolioOrders({
      mode: 'rebalance',
      cashBalance: 0,
      requiredCashReserve: 0,
      minTradeValue: 10,
      policy: policy({ capitalGainsTaxPct: 20, maxCostPct: 100 }),
      candidates: [{ symbol: 'AAA', action: 'sell', requestedTradeValue: 100, referencePrice: 10 }],
    });

    expect(result.status).toBe('partial');
    expect(result.orders[0]).toMatchObject({ action: 'hold', optimizationDecision: 'invalid-tax-lots' });
  });

  it('is deterministic for reordered equal-priority buy candidates', () => {
    const candidates: readonly PortfolioOrderCandidate[] = [
      { symbol: 'BBB', action: 'buy', requestedTradeValue: 60, referencePrice: 10 },
      { symbol: 'AAA', action: 'buy', requestedTradeValue: 60, referencePrice: 10 },
    ];
    const input = {
      mode: 'contribution' as const,
      cashBalance: 100,
      requiredCashReserve: 0,
      minTradeValue: 10,
      policy: policy(),
    };
    const left = optimizePortfolioOrders({ ...input, candidates });
    const right = optimizePortfolioOrders({ ...input, candidates: [...candidates].reverse() });

    expect(left.orders).toEqual(right.orders);
    expect(left.orders.map((order) => ({ symbol: order.symbol, tradeValue: order.tradeValue, decision: order.optimizationDecision }))).toEqual([
      { symbol: 'AAA', tradeValue: 60, decision: 'execute' },
      { symbol: 'BBB', tradeValue: 40, decision: 'cash-limited' },
    ]);
  });

  it('returns invalid instead of losing precision outside the safe-cent range', () => {
    const result = optimizePortfolioOrders({
      mode: 'contribution',
      cashBalance: 100,
      requiredCashReserve: 0,
      minTradeValue: 1,
      policy: policy(),
      candidates: [{ symbol: 'AAA', action: 'buy', requestedTradeValue: Number.MAX_VALUE, referencePrice: 1 }],
    });
    expect(result.status).toBe('invalid');
  });
});

describe('estimateActualPortfolioOrderCosts', () => {
  it('recomputes actual FIFO gain and keeps estimated taxes out of ledger cash effect', () => {
    const result = estimateActualPortfolioOrderCosts({
      symbol: 'AAA',
      action: 'sell',
      quantity: 15,
      referencePrice: 300,
      actualPrice: 300,
      actualCommission: 15,
      policy: policy({ capitalGainsTaxPct: 20, maxCostPct: 100 }),
      openLots: FIFO_LOTS,
    });

    expect(result.estimatedCostBasis).toBe(2_010);
    expect(result.fifoLots).toHaveLength(2);
    expect(result.costs).toEqual({
      commission: 15,
      slippage: 0,
      transactionTax: 0,
      capitalGainsTax: 495,
      tax: 495,
      taxableGain: 2_475,
      total: 510,
      netCashEffect: 4_485,
    });
  });

  it('rounds favorable signed slippage toward zero', () => {
    const result = estimateActualPortfolioOrderCosts({
      symbol: 'AAA',
      action: 'buy',
      quantity: 1,
      referencePrice: 100,
      actualPrice: 98.991,
      actualCommission: 0,
      policy: policy(),
    });
    expect(result.costs.slippage).toBe(-1);
    expect(result.costs.total).toBe(-1);
    expect(result.costs.netCashEffect).toBe(-99);
  });

  it('uses actual sell notional for transaction tax and requires complete lots', () => {
    const input = {
      symbol: 'AAA',
      action: 'sell' as const,
      quantity: 10,
      referencePrice: 100,
      actualPrice: 99.9,
      actualCommission: 0,
      policy: policy({ sellTransactionTaxBps: 20, capitalGainsTaxPct: 20, maxCostPct: 100 }),
    };
    expect(() => estimateActualPortfolioOrderCosts(input)).toThrow(/FIFO lots/);

    const result = estimateActualPortfolioOrderCosts({
      ...input,
      openLots: [Object.freeze({
        transactionId: 'lot', symbol: 'AAA', acquiredAt: '2025-01-01T00:00:00.000Z', quantity: 10, unitCost: 50,
      })],
    });
    expect(result.costs).toMatchObject({
      slippage: 1,
      transactionTax: 2,
      taxableGain: 497,
      capitalGainsTax: 99.4,
      total: 102.4,
      netCashEffect: 999,
    });
  });
});
