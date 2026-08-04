import { describe, expect, it } from 'vitest';
import { MarketEngine } from './engine.js';

describe('MarketEngine immutable batch contract', () => {
  it('publishes one frozen batch and preserves prior snapshots', () => {
    const local = new MarketEngine();
    local.stop();

    const before = new Map(local.getAll().map((quote) => [quote.symbol, quote]));
    let callbackCount = 0;
    const unsubscribe = local.subscribeAll(() => {
      callbackCount += 1;
    });

    const batch = local.runMockTick();
    unsubscribe();

    expect(batch).not.toBeNull();
    expect(callbackCount).toBe(1);
    expect(Object.isFrozen(batch)).toBe(true);
    expect(Object.isFrozen(batch?.quotes)).toBe(true);
    expect(Object.isFrozen(batch?.changedSymbols)).toBe(true);
    expect(new Set(batch?.changedSymbols).size).toBe(batch?.changedSymbols.length);
    expect(batch?.quotes.every((quote) => quote.kind === 'crypto')).toBe(true);

    for (const quote of batch?.quotes ?? []) {
      const prior = before.get(quote.symbol);
      expect(prior).toBeDefined();
      expect(quote).not.toBe(prior);
      expect(Object.isFrozen(quote)).toBe(true);
      expect(Object.isFrozen(quote.spark)).toBe(true);
      expect(Object.isFrozen(quote.sessions)).toBe(true);
      expect(prior?.price).toBe(before.get(quote.symbol)?.price);
      expect(local.getQuote(quote.symbol)).toBe(quote);
    }

    const changed = new Set(batch?.changedSymbols ?? []);
    for (const quote of local.getAll()) {
      if (!changed.has(quote.symbol)) expect(quote).toBe(before.get(quote.symbol));
    }
  });

  it('returns frozen, ordered OHLC histories with valid bounds', () => {
    const local = new MarketEngine();
    const history = local.getHistory('AMD', '5D');

    expect(history).toHaveLength(130);
    expect(Object.isFrozen(history)).toBe(true);
    let previousTime = -Infinity;
    for (const candle of history) {
      expect(Object.isFrozen(candle)).toBe(true);
      expect(candle.time).toBeGreaterThan(previousTime);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.volume).toBeGreaterThanOrEqual(0);
      previousTime = candle.time;
    }
  });
});
