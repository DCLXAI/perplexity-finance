import { describe, expect, it } from 'vitest';
import { calculatePortfolioXirr, computePortfolioPerformance } from './performance.js';
import type { DataProvenance, PortfolioSnapshot, PortfolioTransaction, RemoteCandle } from '@/shared/api';

function transaction(
  id: string,
  kind: PortfolioTransaction['kind'],
  tradeAt: string,
  values: Partial<PortfolioTransaction> = {},
): PortfolioTransaction {
  return Object.freeze({
    id,
    portfolioId: 'portfolio-1',
    kind,
    quantity: 0,
    price: 0,
    cashAmount: 0,
    fees: 0,
    tradeAt,
    createdAt: tradeAt,
    ...values,
  });
}

function snapshot(capturedAt: string, totalValue: number, netContributions: number): PortfolioSnapshot {
  return Object.freeze({
    id: capturedAt,
    portfolioId: 'portfolio-1',
    capturedAt,
    asOfISO: capturedAt,
    totalValue,
    cashBalance: totalValue,
    marketValue: 0,
    netContributions,
    totalReturn: totalValue - netContributions,
    valuationQuality: 'verified',
  });
}

function candle(date: string, close: number): RemoteCandle {
  return Object.freeze({
    time: Date.parse(date) / 1_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  });
}

const provenance: DataProvenance = Object.freeze({
  source: 'alpaca',
  sourceLabel: 'Alpaca',
  mode: 'live',
  quality: 'verified',
  providerTimestamp: '2026-03-01T00:00:00.000Z',
  ingestedAt: '2026-03-01T00:00:01.000Z',
  feed: 'test',
});

describe('computePortfolioPerformance', () => {
  it('links returns after removing external contribution changes', () => {
    const result = computePortfolioPerformance({
      snapshots: [
        snapshot('2026-01-01T00:00:00.000Z', 100, 100),
        snapshot('2026-02-01T00:00:00.000Z', 120, 100),
        snapshot('2026-03-01T00:00:00.000Z', 180, 150),
      ],
      transactions: [
        transaction('deposit-1', 'deposit', '2026-01-01T00:00:00.000Z', { cashAmount: 100 }),
        transaction('deposit-2', 'deposit', '2026-02-15T00:00:00.000Z', { cashAmount: 50 }),
      ],
      benchmarkSymbol: 'SPY',
      benchmarkCandles: [
        candle('2026-01-01T00:00:00.000Z', 100),
        candle('2026-02-01T00:00:00.000Z', 110),
        candle('2026-03-01T00:00:00.000Z', 120),
      ],
      benchmarkProvenance: provenance,
    });

    expect(result.status).toBe('available');
    expect(result.timeWeightedReturnPct).toBeCloseTo(30, 6);
    expect(result.benchmarkReturnPct).toBeCloseTo(20, 6);
    expect(result.excessReturnPct).toBeCloseTo(10, 6);
    expect(result.flowAdjustedIntervals).toBe(1);
    expect(result.points.map((point) => point.cumulativeTwrPct)).toEqual([0, 20, 30]);
  });

  it('calculates an annualized money-weighted return', () => {
    const value = calculatePortfolioXirr(
      [transaction('deposit-1', 'deposit', '2025-01-01T00:00:00.000Z', { cashAmount: 1_000 })],
      1_100,
      '2026-01-01T00:00:00.000Z',
    );
    expect(value).toBeCloseTo(10, 4);
  });

  it('excludes a reversed contribution from XIRR cash flows', () => {
    const value = calculatePortfolioXirr([
      transaction('deposit-old', 'deposit', '2025-01-01T00:00:00.000Z', { cashAmount: 1_000 }),
      transaction('reverse-old', 'reversal', '2025-01-02T00:00:00.000Z', { reversalOf: 'deposit-old' }),
      transaction('deposit-live', 'deposit', '2025-01-01T00:00:00.000Z', { cashAmount: 500 }),
    ], 550, '2026-01-01T00:00:00.000Z');
    expect(value).toBeCloseTo(10, 4);
  });

  it('reports insufficient data without two valid snapshots', () => {
    const result = computePortfolioPerformance({
      snapshots: [snapshot('2026-01-01T00:00:00.000Z', 100, 100)],
      transactions: [],
      benchmarkSymbol: 'SPY',
      benchmarkCandles: [],
    });
    expect(result.status).toBe('insufficient-data');
    expect(result.timeWeightedReturnPct).toBeUndefined();
  });
});
