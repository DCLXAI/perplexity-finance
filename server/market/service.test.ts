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
