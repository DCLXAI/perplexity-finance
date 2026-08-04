import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetCacheForTests } from '../cache.js';
import { resetConfigForTests } from '../config.js';
import { providerStatus, resetProviderRegistryForTests } from '../observability/provider-registry.js';
import { resetCircuitsForTests } from '../resilience/circuit-breaker.js';
import type { RemoteQuotePatch } from '../../src/shared/api.js';
import { runQuoteProvider } from './provider-runner.js';
import type { QuoteProvider } from './providers/types.js';

function quote(): RemoteQuotePatch {
  const asOfISO = new Date().toISOString();
  return Object.freeze({
    symbol: 'AMD',
    price: 100,
    prevClose: 99,
    open: 99.5,
    high: 101,
    low: 98,
    volume: 1000,
    asOfISO,
    session: 'regular',
    sessionStatus: 'open',
    provenance: Object.freeze({
      source: 'finnhub',
      sourceLabel: 'Finnhub test',
      mode: 'delayed',
      quality: 'provider',
      providerTimestamp: asOfISO,
      ingestedAt: asOfISO,
      feed: 'test',
      delayedSeconds: 900,
    }),
  });
}

beforeEach(() => {
  resetCacheForTests();
  resetConfigForTests();
  resetProviderRegistryForTests();
  resetCircuitsForTests();
});
afterEach(() => {
  resetCacheForTests();
  resetConfigForTests();
  resetProviderRegistryForTests();
  resetCircuitsForTests();
});

describe('provider runner evidence', () => {
  it('does not count a fresh cache hit as another provider success', async () => {
    let calls = 0;
    const provider: QuoteProvider = {
      name: 'finnhub',
      label: 'Finnhub test',
      configured: true,
      supports: (symbol) => symbol === 'AMD',
      fetchQuotes: async () => {
        calls += 1;
        return Object.freeze([quote()]);
      },
    };

    const first = await runQuoteProvider(provider, ['AMD']);
    const second = await runQuoteProvider(provider, ['AMD']);

    expect(first.quotes).toHaveLength(1);
    expect(second.quotes).toHaveLength(1);
    expect(calls).toBe(1);
    expect(providerStatus('finnhub').attempts).toBe(1);
    expect(providerStatus('finnhub').message).toContain('공급자 호출 없음');
  });
});
