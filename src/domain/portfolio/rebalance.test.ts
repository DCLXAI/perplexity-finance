import { describe, expect, it } from 'vitest';
import type { PortfolioHolding } from '@/shared/api';
import { computeRebalancePlan, validateAllocationTargets } from './rebalance.js';

function holding(symbol: string, marketValue: number, price: number): PortfolioHolding {
  return Object.freeze({
    symbol,
    name: symbol,
    assetKind: 'stock',
    quantity: marketValue / price,
    costBasis: marketValue,
    averageCost: price,
    realizedPnl: 0,
    income: 0,
    feesPaid: 0,
    price,
    marketValue,
    unrealizedPnl: 0,
    totalPnl: 0,
    allocationPct: marketValue / 10,
    valuationQuality: 'verified',
  });
}

describe('computeRebalancePlan', () => {
  it('creates balanced buy and sell suggestions when drift breaches the threshold', () => {
    const plan = computeRebalancePlan({
      totalValue: 1_000,
      cashBalance: 0,
      holdings: [holding('AAA', 600, 20), holding('BBB', 400, 10)],
      policy: { driftThresholdPct: 5, minTradeValue: 25, targets: [{ symbol: 'AAA', targetPct: 50 }, { symbol: 'BBB', targetPct: 50 }] },
    });

    expect(plan.status).toBe('available');
    expect(plan.rebalanceNeeded).toBe(true);
    expect(plan.sellValue).toBe(100);
    expect(plan.buyValue).toBe(100);
    expect(plan.estimatedCashAfter).toBe(0);
    expect(plan.items.find((item) => item.symbol === 'AAA')).toMatchObject({ action: 'sell', tradeValue: 100, estimatedQuantity: 5 });
    expect(plan.items.find((item) => item.symbol === 'BBB')).toMatchObject({ action: 'buy', tradeValue: 100, estimatedQuantity: 10 });
  });

  it('holds every asset while maximum drift remains below the threshold', () => {
    const plan = computeRebalancePlan({
      totalValue: 1_000,
      cashBalance: 0,
      holdings: [holding('AAA', 520, 20), holding('BBB', 480, 10)],
      policy: { driftThresholdPct: 5, minTradeValue: 25, targets: [{ symbol: 'AAA', targetPct: 50 }, { symbol: 'BBB', targetPct: 50 }] },
    });

    expect(plan.rebalanceNeeded).toBe(false);
    expect(plan.items.every((item) => item.action === 'hold')).toBe(true);
  });

  it('includes cash as a target and excludes trades below the minimum', () => {
    const plan = computeRebalancePlan({
      totalValue: 1_000,
      cashBalance: 200,
      holdings: [holding('AAA', 800, 20)],
      policy: { driftThresholdPct: 1, minTradeValue: 150, targets: [{ symbol: 'AAA', targetPct: 70 }, { symbol: 'CASH', targetPct: 30 }] },
    });

    expect(plan.rebalanceNeeded).toBe(true);
    expect(plan.items.find((item) => item.symbol === 'AAA')).toMatchObject({ action: 'hold', tradeValue: 0 });
    expect(plan.warnings).toContain('편차 임계치는 넘었지만 모든 주문이 최소 주문금액보다 작습니다.');
  });
});

describe('validateAllocationTargets', () => {
  it('rejects duplicate symbols and totals other than 100%', () => {
    const warnings = validateAllocationTargets([{ symbol: 'AAA', targetPct: 60 }, { symbol: 'aaa', targetPct: 20 }]);
    expect(warnings.some((warning) => warning.includes('중복'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('100%'))).toBe(true);
  });
});
