import { describe, expect, it } from 'vitest';
import { assetKind, isAlpacaSupported } from './symbols.js';

/**
 * Final whole-branch review CRITICAL: P11 added 159 KRX codes to the catalog `assetKind` reads
 * from, but never region-scoped it. Before this guard, `assetKind('005930') === 'stock'`, so
 * `isAlpacaSupported` and every provider's `supports()` (`AlpacaMarketDataProvider`,
 * `FinnhubQuoteProvider`) claimed every Korean listing code as a real US-equity symbol — nothing
 * in the quality gate would have caught a provider that happened to answer a 6-digit code with
 * plausible-looking numbers; it would have been accepted, stamped `verified`, and rendered with
 * a `₩`. Region selection must never change provenance rules or the quality gate (see
 * ARCHITECTURE.md), so a non-US-region symbol must be `'unsupported'` here, unconditionally.
 */
describe('assetKind region guard', () => {
  it('classifies a KR listing as unsupported, never as a dispatchable stock', () => {
    expect(assetKind('005930')).toBe('unsupported'); // Samsung Electronics
    expect(assetKind('000660')).toBe('unsupported'); // SK hynix
  });

  it('still classifies a US stock and a crypto pair correctly (no regression from the KR guard)', () => {
    expect(assetKind('AAPL')).toBe('stock');
    expect(assetKind('BTCUSD')).toBe('crypto');
  });

  it('keeps isAlpacaSupported (and therefore every provider.supports()) false for a KR code', () => {
    expect(isAlpacaSupported('005930')).toBe(false);
    expect(isAlpacaSupported('AAPL')).toBe(true);
  });
});
