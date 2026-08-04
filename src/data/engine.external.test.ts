import { describe, expect, it } from 'vitest';
import { MarketEngine } from './engine.js';
import type { DataProvenance, RemoteQuotePatch } from '@/shared/api';

const provenance: DataProvenance = Object.freeze({
  source: 'alpaca',
  sourceLabel: 'Alpaca Market Data',
  mode: 'live',
  quality: 'provider',
  providerTimestamp: '2026-07-12T08:00:00.000Z',
  ingestedAt: '2026-07-12T08:00:01.000Z',
  feed: 'iex',
});

describe('external market ingestion', () => {
  it('atomically replaces quote and history snapshots with provenance', () => {
    const market = new MarketEngine();
    const before = market.getQuote('AMD');
    expect(before).toBeDefined();
    let batches = 0;
    const unsubscribe = market.subscribeAll(() => { batches += 1; });
    const patch: RemoteQuotePatch = {
      symbol: 'AMD',
      price: 600,
      prevClose: 590,
      open: 592,
      high: 603,
      low: 588,
      volume: 1_000_000,
      marketCap: 950_000_000_000,
      asOfISO: provenance.providerTimestamp,
      session: 'regular',
      sessionStatus: 'open',
      provenance,
    };
    market.applyExternalQuotes([patch]);
    const after = market.getQuote('AMD');
    expect(after).not.toBe(before);
    expect(after?.price).toBe(600);
    expect(after?.provenance.source).toBe('alpaca');
    expect(Object.isFrozen(after)).toBe(true);
    expect(batches).toBe(1);

    const history = market.replaceExternalHistory('AMD', '1D', [
      { time: 1_783_840_000, open: 590, high: 602, low: 589, close: 600, volume: 100 },
    ], provenance);
    expect(history[0]?.provenance?.source).toBe('alpaca');
    expect(Object.isFrozen(history)).toBe(true);
    unsubscribe();
    market.stop();
  });
});
