import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCacheForTests } from '../cache.js';
import { resetConfigForTests } from '../config.js';
import { resetProviderRegistryForTests } from '../observability/provider-registry.js';
import { resetCircuitsForTests } from '../resilience/circuit-breaker.js';
import { ApiError } from '../http/function.js';
import type { ProviderName, RemoteQuotePatch } from '../../src/shared/api.js';
import { AlpacaMarketDataProvider } from './alpaca.js';
import { FinnhubQuoteProvider } from './providers/finnhub.js';
import { getMarketHistory, getMarketQuotes } from './service.js';

function remoteQuote(
  provider: ProviderName,
  price: number,
  mode: RemoteQuotePatch['provenance']['mode'] = 'live',
): RemoteQuotePatch {
  const asOfISO = new Date().toISOString();
  return Object.freeze({
    symbol: 'AMD',
    price,
    prevClose: 99,
    open: 99.5,
    high: Math.max(101, price),
    low: Math.min(98, price),
    volume: 1000,
    asOfISO,
    session: 'regular',
    sessionStatus: 'open',
    provenance: Object.freeze({
      source: provider,
      sourceLabel: provider,
      mode,
      quality: 'provider',
      providerTimestamp: asOfISO,
      ingestedAt: asOfISO,
      feed: 'test',
      ...(mode === 'delayed' ? { delayedSeconds: 900 } : {}),
    }),
  });
}

beforeEach(() => {
  delete process.env.ALPACA_API_KEY_ID;
  delete process.env.ALPACA_API_SECRET_KEY;
  delete process.env.FINNHUB_API_KEY;
  delete process.env.COINBASE_ENABLED;
  delete process.env.MARKET_PROVIDER_MODE;
  delete process.env.ALLOW_MOCK_FALLBACK;
  resetConfigForTests();
  resetCacheForTests();
  resetProviderRegistryForTests();
  resetCircuitsForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetConfigForTests();
  resetCacheForTests();
  resetProviderRegistryForTests();
  resetCircuitsForTests();
});

describe('market provider fallback contracts', () => {
  it('never presents local data as live when provider credentials are absent', async () => {
    const response = await getMarketQuotes(['AMD', 'BTCUSD'], 'test-quotes');
    expect(response.mode).toBe('fallback');
    expect(response.quotes).toHaveLength(2);
    expect(response.quotes.every((quote) => quote.provenance.source === 'local-simulation')).toBe(true);
    expect(response.quotes.every((quote) => quote.provenance.mode === 'fallback')).toBe(true);
  });

  it('invokes a secondary provider when the primary response fails the quality gate', async () => {
    process.env.ALPACA_API_KEY_ID = 'test-key';
    process.env.ALPACA_API_SECRET_KEY = 'test-secret';
    process.env.FINNHUB_API_KEY = 'test-finnhub';
    process.env.MARKET_PROVIDER_MODE = 'failover';
    process.env.ALLOW_MOCK_FALLBACK = 'false';
    resetConfigForTests();

    vi.spyOn(AlpacaMarketDataProvider.prototype, 'fetchQuotes')
      .mockResolvedValue(Object.freeze([remoteQuote('alpaca', 0)]));
    const secondary = vi.spyOn(FinnhubQuoteProvider.prototype, 'fetchQuotes')
      .mockResolvedValue(Object.freeze([remoteQuote('finnhub', 100, 'delayed')]));

    const response = await getMarketQuotes(['AMD'], 'test-quality-failover');
    expect(secondary).toHaveBeenCalledWith(['AMD']);
    expect(response.quotes).toHaveLength(1);
    expect(response.quotes[0].provenance.source).toBe('finnhub');
    expect(response.quotes[0].provenance.verification?.strategy).toBe('failover');
  });

  it('returns an empty remote candle set so the browser keeps calendar-correct local history', async () => {
    const response = await getMarketHistory('AMD', '5D', 'test-history');
    expect(response.candles).toHaveLength(0);
    expect(response.provenance.mode).toBe('fallback');
    expect(response.warning).toContain('로컬');
  });


  it('fails closed when mock history fallback is explicitly disabled', async () => {
    process.env.ALLOW_MOCK_FALLBACK = 'false';
    resetConfigForTests();
    await expect(getMarketHistory('AMD', '5D', 'test-no-fallback')).rejects.toMatchObject({
      status: 503,
      code: 'HISTORY_PROVIDER_UNAVAILABLE',
    } satisfies Partial<ApiError>);
  });

  it('rejects unknown symbols instead of returning an empty success payload', async () => {
    await expect(getMarketQuotes(['NOT-A-SYMBOL'], 'test-unknown')).rejects.toMatchObject({
      status: 400,
      code: 'UNKNOWN_SYMBOL',
    } satisfies Partial<ApiError>);
    await expect(getMarketHistory('NOT-A-SYMBOL', '1D', 'test-unknown')).rejects.toMatchObject({
      status: 400,
      code: 'UNKNOWN_SYMBOL',
    } satisfies Partial<ApiError>);
  });
});

/**
 * Final whole-branch review IMPORTANT: no P11 task touched `server/market/`, but P11 changed
 * `catalog.ts`'s input (`engine.getAll()` now spans both regions), so 159 KRX codes became
 * eligible for provider dispatch. `assetKind`'s region guard (symbols.test.ts) closes the
 * critical half of this (never send a KR symbol to a US-equity provider); these guard the
 * corollary the review also called out: a Korean symbol sharing a poll batch with healthy US
 * ones must not make the *whole response* read as degraded, and must not cost a
 * `getLastKnownGood` round trip it has no chance of ever needing.
 *
 * Before the fix, a batch of one live US quote + one Korean symbol reported `mode: 'mixed'` and
 * carried a "검증 공급자 값이 없어" warning for the Korean symbol — both of which
 * `marketRuntime.poll` (client) reads as globally degraded, which is what put the header badge
 * in 혼합 데이터/degraded state on US pages purely because Korean symbols were also registered
 * for background polling.
 */
describe('market quotes region guard', () => {
  it('never dispatches a KR symbol to a configured provider, and keeps it out of mode/warning computation', async () => {
    process.env.ALPACA_API_KEY_ID = 'test-key';
    process.env.ALPACA_API_SECRET_KEY = 'test-secret';
    process.env.MARKET_PROVIDER_MODE = 'primary';
    resetConfigForTests();

    const fetchQuotes = vi.spyOn(AlpacaMarketDataProvider.prototype, 'fetchQuotes')
      .mockResolvedValue(Object.freeze([remoteQuote('alpaca', 100)]));

    const response = await getMarketQuotes(['AMD', '005930'], 'test-region-guard');

    // The KR symbol must never even reach the provider's fetchQuotes call.
    expect(fetchQuotes).toHaveBeenCalledWith(['AMD']);
    expect(fetchQuotes).not.toHaveBeenCalledWith(expect.arrayContaining(['005930']));

    // A healthy US quote alongside an out-of-region KR fallback must not read as degraded.
    expect(response.mode).toBe('live');
    expect(response.mode).not.toBe('mixed');
    expect(response.warnings).toHaveLength(0);

    // The KR row is still present (so it renders on a KR page) as a clean local fallback.
    const kr = response.quotes.find((quote) => quote.symbol === '005930');
    expect(kr?.provenance.source).toBe('local-simulation');
    expect(kr?.provenance.mode).toBe('fallback');
    const us = response.quotes.find((quote) => quote.symbol === 'AMD');
    expect(us?.provenance.source).toBe('alpaca');
    expect(us?.provenance.mode).toBe('live');
  });

  it('still reports fallback/mock behavior for a KR symbol when no provider is configured at all (unchanged baseline)', async () => {
    const response = await getMarketQuotes(['005930'], 'test-region-guard-unconfigured');
    expect(response.mode).toBe('fallback');
    expect(response.quotes).toHaveLength(1);
    expect(response.quotes[0].provenance.source).toBe('local-simulation');
  });
});
