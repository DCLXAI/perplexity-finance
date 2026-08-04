import { describe, expect, it } from 'vitest';
import { runPortfolioScenario } from './scenario.js';
import type { PortfolioSummary } from '@/shared/api';

const summary = {
  cashBalance: 100,
  holdings: [
    { symbol: 'AMD', sector: '기술', assetKind: 'stock', marketValue: 600 },
    { symbol: 'BTCUSD', assetKind: 'crypto', marketValue: 300 },
  ],
} as unknown as PortfolioSummary;

describe('runPortfolioScenario', () => {
  it('applies matching shocks while leaving cash unchanged', () => {
    const result = runPortfolioScenario(summary, [
      { targetType: 'sector', target: '기술', changePct: -20 },
      { targetType: 'asset-kind', target: 'crypto', changePct: -30 },
    ]);
    expect(result.beforeValue).toBe(1_000);
    expect(result.afterValue).toBe(790);
    expect(result.absoluteChange).toBe(-210);
    expect(result.changePct).toBe(-21);
    expect(result.impacts).toEqual([
      expect.objectContaining({ symbol: 'AMD', change: -120 }),
      expect.objectContaining({ symbol: 'BTCUSD', change: -90 }),
    ]);
  });

  it('caps destructive shocks at total loss', () => {
    const result = runPortfolioScenario(summary, [
      { targetType: 'all', target: '*', changePct: -120 },
    ]);
    expect(result.afterValue).toBe(100);
    expect(result.warnings).toHaveLength(2);
  });
});
