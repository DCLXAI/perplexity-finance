import { createHash } from 'node:crypto';
import type { DataMode, ProviderName, RemoteQuotePatch } from '../../src/shared/api.js';
import { cached } from '../cache.js';
import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import {
  configureProvider,
  recordProviderCacheHit,
  recordProviderFailure,
  recordProviderSuccess,
} from '../observability/provider-registry.js';
import { recordIncident } from '../ops/incidents.js';
import { acquireCircuit, circuitFailed, circuitSucceeded } from '../resilience/circuit-breaker.js';
import type { QuoteProvider } from './providers/types.js';

export interface ProviderRunResult {
  readonly provider: ProviderName;
  readonly quotes: readonly RemoteQuotePatch[];
  readonly skipped: boolean;
  readonly error?: string;
}

function modeFor(provider: QuoteProvider): DataMode {
  const config = loadConfig();
  if (provider.name === 'alpaca') return config.alpacaFeed === 'delayed_sip' ? 'delayed' : 'live';
  if (provider.name === 'finnhub') return config.finnhubMode;
  return 'live';
}
function cacheKey(provider: ProviderName, symbols: readonly string[]): string {
  const digest = createHash('sha256').update([...symbols].sort().join(',')).digest('hex').slice(0, 24);
  return `market:quotes:p3:${provider}:${digest}`;
}
function markStale(quote: RemoteQuotePatch): RemoteQuotePatch {
  return Object.freeze({
    ...quote,
    provenance: Object.freeze({
      ...quote.provenance,
      mode: 'stale',
      quality: quote.provenance.quality === 'synthetic' ? 'synthetic' : 'verified',
      ingestedAt: new Date().toISOString(),
      note: [quote.provenance.note, '공급자 실패로 캐시된 마지막 값을 사용합니다.'].filter(Boolean).join(' · '),
    }),
  });
}

export async function runQuoteProvider(
  provider: QuoteProvider,
  symbols: readonly string[],
): Promise<ProviderRunResult> {
  configureProvider(provider.name, provider.configured, provider.label, modeFor(provider));
  const supported = symbols.filter((symbol) => provider.supports(symbol));
  if (!provider.configured || !supported.length) {
    return Object.freeze({ provider: provider.name, quotes: Object.freeze([]), skipped: true });
  }

  const circuit = acquireCircuit(provider.name, true);
  if (circuit.state === 'open') {
    const message = `${provider.label} circuit open${circuit.retryAt ? ` until ${circuit.retryAt}` : ''}`;
    recordIncident({
      kind: 'provider-circuit-open',
      severity: 'warning',
      providers: [provider.name],
      message,
      details: { failures: circuit.failures, retryAt: circuit.retryAt ?? null },
    });
    return Object.freeze({ provider: provider.name, quotes: Object.freeze([]), skipped: true, error: message });
  }

  const started = performance.now();
  try {
    const config = loadConfig();
    const hit = await cached(
      cacheKey(provider.name, supported),
      config.quoteCacheSeconds,
      () => provider.fetchQuotes(supported),
      config.staleIfErrorSeconds,
      { forceRefresh: circuit.state === 'half-open' },
    );
    if (!hit.value.length) throw new Error(`${provider.label} returned no supported quotes`);
    const latency = Math.round((performance.now() - started) * 100) / 100;
    const freshness = Math.max(...hit.value.map((quote) =>
      Math.max(0, (Date.now() - new Date(quote.asOfISO).getTime()) / 1000),
    ));

    if (hit.stale) {
      const staleError = new Error(`${provider.label} served stale cache after provider failure`);
      circuitFailed(provider.name, staleError);
      recordProviderFailure(provider.name, staleError, latency);
      return Object.freeze({
        provider: provider.name,
        quotes: Object.freeze(hit.value.map(markStale)),
        skipped: false,
        error: staleError.message,
      });
    }

    if (hit.cache === 'miss') {
      circuitSucceeded(provider.name);
      recordProviderSuccess(provider.name, latency, {
        mode: modeFor(provider),
        freshnessSeconds: freshness,
        message: `${hit.value.length}/${supported.length}개 · 실제 공급자 호출 성공`,
      });
    } else {
      recordProviderCacheHit(provider.name, hit.cache, {
        mode: modeFor(provider),
        freshnessSeconds: freshness,
      });
    }
    return Object.freeze({ provider: provider.name, quotes: hit.value, skipped: false });
  } catch (error) {
    const latency = Math.round((performance.now() - started) * 100) / 100;
    const circuitState = circuitFailed(provider.name, error);
    recordProviderFailure(provider.name, error, latency);
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('market.provider_failed', { provider: provider.name, message, circuit: circuitState.state });
    recordIncident({
      kind: 'provider-failure',
      severity: circuitState.state === 'open' ? 'critical' : 'warning',
      providers: [provider.name],
      message: `${provider.label} 요청 실패: ${message}`,
      details: { latencyMs: latency, circuitState: circuitState.state, failures: circuitState.failures },
    });
    return Object.freeze({
      provider: provider.name,
      quotes: Object.freeze([]),
      skipped: false,
      error: message,
    });
  }
}
