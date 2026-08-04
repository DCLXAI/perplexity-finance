import { describe, expect, it } from 'vitest';
import { computePortfolioRisk, type PortfolioHistorySeries } from './risk.js';
import type { DataProvenance, PortfolioHolding, RemoteCandle } from '@/shared/api';

const provenance: DataProvenance = Object.freeze({
  source: 'alpaca', sourceLabel: 'Alpaca', mode: 'live', quality: 'verified',
  providerTimestamp: '2026-07-12T00:00:00.000Z', ingestedAt: '2026-07-12T00:00:01.000Z', feed: 'test',
});

function candles(seed: number): readonly RemoteCandle[] {
  let close = 100 + seed;
  return Object.freeze(Array.from({ length: 100 }, (_, index) => {
    const daily = Math.sin((index + seed) * 0.71) * 0.018 + Math.cos(index * 0.19) * 0.004;
    const open = close;
    close = open * (1 + daily);
    return Object.freeze({
      time: Date.UTC(2026, 0, 1 + index) / 1000,
      open,
      high: Math.max(open, close) * 1.003,
      low: Math.min(open, close) * 0.997,
      close,
      volume: 1_000,
    });
  }));
}

const holdings: readonly PortfolioHolding[] = Object.freeze([
  Object.freeze({ symbol: 'AMD', name: 'AMD', assetKind: 'stock', quantity: 1, costBasis: 500, averageCost: 500, realizedPnl: 0, income: 0, feesPaid: 0, price: 600, marketValue: 600, unrealizedPnl: 100, totalPnl: 100, allocationPct: 60, valuationQuality: 'verified', provenance }),
  Object.freeze({ symbol: 'MSFT', name: 'Microsoft', assetKind: 'stock', quantity: 1, costBasis: 350, averageCost: 350, realizedPnl: 0, income: 0, feesPaid: 0, price: 400, marketValue: 400, unrealizedPnl: 50, totalPnl: 50, allocationPct: 40, valuationQuality: 'verified', provenance }),
]);
const histories: readonly PortfolioHistorySeries[] = Object.freeze([
  Object.freeze({ symbol: 'AMD', candles: candles(1), provenance }),
  Object.freeze({ symbol: 'MSFT', candles: candles(4), provenance }),
]);

describe('computePortfolioRisk', () => {
  it('reports reproducible historical risk and concentration evidence', () => {
    const risk = computePortfolioRisk(holdings, histories, 1_000);
    expect(risk.status).toBe('available');
    expect(risk.dataQuality).toBe('verified');
    expect(risk.observations).toBe(99);
    expect(risk.concentrationHhi).toBeCloseTo(0.52, 6);
    expect(risk.effectiveHoldings).toBeCloseTo(1.92, 2);
    expect(risk.topHoldingPct).toBe(60);
    expect(risk.pricedCoveragePct).toBe(100);
    expect(risk.annualizedVolatilityPct).toBeGreaterThan(0);
    expect(risk.historicalVar95Amount).toBeGreaterThan(0);
    expect(risk.historicalCvar95Amount).toBeGreaterThanOrEqual(risk.historicalVar95Amount ?? 0);
    expect(risk.maxDrawdownPct).toBeGreaterThan(0);
  });
});
