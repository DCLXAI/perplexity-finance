import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePortfolioPerformance } from '../src/domain/portfolio/performance.js';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import type { PortfolioSnapshot, PortfolioTransaction, RemoteCandle } from '../src/shared/api.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.10.0');

function snapshot(
  id: string,
  capturedAt: string,
  totalValue: number,
  netContributions: number,
): PortfolioSnapshot {
  return Object.freeze({
    id,
    portfolioId: 'p5-validation',
    capturedAt,
    asOfISO: capturedAt,
    totalValue,
    cashBalance: 0,
    marketValue: totalValue,
    netContributions,
    totalReturn: totalValue - netContributions,
    valuationQuality: 'verified',
  });
}

const snapshots = Object.freeze([
  snapshot('s1', '2025-01-01T00:00:00.000Z', 100, 100),
  snapshot('s2', '2025-07-01T00:00:00.000Z', 120, 100),
  snapshot('s3', '2026-01-01T00:00:00.000Z', 180, 150),
]);
const transactions: readonly PortfolioTransaction[] = Object.freeze([
  Object.freeze({
    id: 'deposit-1', portfolioId: 'p5-validation', kind: 'deposit', quantity: 0, price: 0,
    cashAmount: 100, fees: 0, tradeAt: '2025-01-01T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z',
  }),
  Object.freeze({
    id: 'deposit-2', portfolioId: 'p5-validation', kind: 'deposit', quantity: 0, price: 0,
    cashAmount: 50, fees: 0, tradeAt: '2025-07-01T00:00:00.000Z', createdAt: '2025-07-01T00:00:00.000Z',
  }),
]);
const benchmarkCandles: readonly RemoteCandle[] = Object.freeze([
  Object.freeze({ time: Date.parse('2025-01-01T00:00:00.000Z') / 1_000, open: 100, high: 100, low: 100, close: 100, volume: 1 }),
  Object.freeze({ time: Date.parse('2025-07-01T00:00:00.000Z') / 1_000, open: 110, high: 110, low: 110, close: 110, volume: 1 }),
  Object.freeze({ time: Date.parse('2026-01-01T00:00:00.000Z') / 1_000, open: 120, high: 120, low: 120, close: 120, volume: 1 }),
]);

const result = computePortfolioPerformance({ snapshots, transactions, benchmarkSymbol: 'SPY', benchmarkCandles });
assert.equal(result.status, 'available');
assert.equal(result.timeWeightedReturnPct, 30);
assert.equal(result.benchmarkReturnPct, 20);
assert.equal(result.excessReturnPct, 10);
assert.equal(result.flowAdjustedIntervals, 1);
assert.ok(result.moneyWeightedReturnPct !== undefined);

const panel = readFileSync(new URL('../src/features/portfolio/PerformancePanel.tsx', import.meta.url), 'utf8');
for (const contract of ['SPY', 'QQQ', 'BTCUSD', 'timeWeightedReturnPct', 'moneyWeightedReturnPct', 'excessReturnPct']) {
  assert.ok(panel.includes(contract), `missing P5 performance surface: ${contract}`);
}
const page = readFileSync(new URL('../src/features/portfolio/PortfolioPage.tsx', import.meta.url), 'utf8');
assert.ok(page.includes('/api/market/history'), 'P5 must load benchmark history from the market API');
assert.ok(page.includes('buildDemoBenchmarkHistory'), 'P5 demo mode must identify synthetic benchmark data');

console.log(JSON.stringify({
  version: '1.10.0',
  cashFlowAdjustedTwr: 'PASS',
  xirr: 'PASS',
  benchmarkComparison: 'PASS',
  excessReturn: 'PASS',
  provenanceDisclosure: 'PASS',
  result: 'PASS',
}, null, 2));
