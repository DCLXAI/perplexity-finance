import { describe, expect, it } from 'vitest';
import { historySpec } from './alpaca.js';

describe('Alpaca history range contracts', () => {
  const now = new Date('2026-07-12T08:00:00.000Z');

  it('uses exact intraday bar budgets by asset calendar', () => {
    expect(historySpec('1D', 'stock', now).maxBars).toBe(26);
    expect(historySpec('5D', 'stock', now).maxBars).toBe(130);
    expect(historySpec('7D', 'stock', now).maxBars).toBe(182);
    expect(historySpec('1D', 'crypto', now).maxBars).toBe(96);
    expect(historySpec('7D', 'crypto', now).maxBars).toBe(672);
  });

  it('anchors calendar ranges to calendar dates instead of arbitrary bar counts', () => {
    expect(historySpec('YTD', 'stock', now).start).toBe('2026-01-01T00:00:00.000Z');
    expect(historySpec('1M', 'stock', now).start).toBe('2026-06-12T08:00:00.000Z');
    expect(historySpec('6M', 'stock', now).start).toBe('2026-01-12T08:00:00.000Z');
    expect(historySpec('1Y', 'stock', now).start).toBe('2025-07-12T08:00:00.000Z');
    expect(historySpec('5Y', 'stock', now).start).toBe('2021-07-12T08:00:00.000Z');
    expect(historySpec('1M', 'stock', now).maxBars).toBeUndefined();
  });
});
