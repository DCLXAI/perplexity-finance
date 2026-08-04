import { describe, expect, it } from 'vitest';
import { valuePortfolioPositions } from './valuation.js';
import type { DataProvenance, PortfolioLedgerPosition, RemoteQuotePatch } from '@/shared/api';

const positions: readonly PortfolioLedgerPosition[] = Object.freeze([
  Object.freeze({ symbol: 'AMD', quantity: 10, costBasis: 1_000, averageCost: 100, realizedPnl: 0, income: 0, feesPaid: 0 }),
  Object.freeze({ symbol: 'BTCUSD', quantity: 0.1, costBasis: 7_000, averageCost: 70_000, realizedPnl: 0, income: 0, feesPaid: 0 }),
  Object.freeze({ symbol: 'MISSING', quantity: 2, costBasis: 100, averageCost: 50, realizedPnl: 0, income: 0, feesPaid: 0 }),
]);

function quote(symbol: string, price: number, provenance: DataProvenance): RemoteQuotePatch {
  return Object.freeze({
    symbol,
    price,
    prevClose: price,
    open: price,
    high: price,
    low: price,
    volume: 1,
    asOfISO: provenance.providerTimestamp,
    session: symbol === 'BTCUSD' ? 'continuous' : 'regular',
    sessionStatus: 'open',
    provenance,
  });
}

const now = '2026-07-12T06:00:00.000Z';
const verified: DataProvenance = Object.freeze({
  source: 'alpaca', sourceLabel: 'Alpaca', mode: 'live', quality: 'verified',
  providerTimestamp: now, ingestedAt: now, feed: 'test',
  verification: Object.freeze({ strategy: 'cross-provider', providers: Object.freeze(['alpaca', 'finnhub'] as const), lineageId: 'line-1', freshnessSeconds: 1, decision: 'accepted' }),
});
const syntheticTime = '2026-07-12T05:45:00.000Z';
const synthetic: DataProvenance = Object.freeze({
  source: 'local-simulation', sourceLabel: 'Local', mode: 'fallback', quality: 'synthetic',
  providerTimestamp: syntheticTime, ingestedAt: now, feed: 'test',
});

describe('valuePortfolioPositions', () => {
  it('separates verified, estimated and unpriced holdings', () => {
    const result = valuePortfolioPositions(
      positions,
      new Map([
        ['AMD', quote('AMD', 120, verified)],
        ['BTCUSD', quote('BTCUSD', 80_000, synthetic)],
      ]),
      new Map([
        ['AMD', { symbol: 'AMD', name: 'AMD', sector: '기술', assetKind: 'stock' as const }],
        ['BTCUSD', { symbol: 'BTCUSD', name: 'Bitcoin', assetKind: 'crypto' as const }],
      ]),
    );
    expect(result.valuationQuality).toBe('mixed');
    expect(result.marketValue).toBe(9_200);
    expect(result.holdings.find((entry) => entry.symbol === 'AMD')?.valuationQuality).toBe('verified');
    expect(result.holdings.find((entry) => entry.symbol === 'BTCUSD')?.valuationQuality).toBe('estimated');
    expect(result.holdings.find((entry) => entry.symbol === 'MISSING')?.valuationQuality).toBe('unpriced');
    expect(result.asOfISO).toBe(syntheticTime);
    expect(result.warnings).toHaveLength(2);
  });
});
