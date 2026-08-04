import { cacheGet, cacheSet, cached } from '../cache.js';
import { loadConfig } from '../config.js';
import { ApiError } from '../http/function.js';
import { logger } from '../observability/logger.js';
import {
  configureProvider,
  providerStatus,
  providerStatuses,
  recordProviderCacheHit,
  recordProviderFailure,
  recordProviderSuccess,
} from '../observability/provider-registry.js';
import { recordIncident } from '../ops/incidents.js';
import { acquireCircuit, circuitFailed, circuitSucceeded } from '../resilience/circuit-breaker.js';
import type {
  DataMode,
  DataProvenance,
  HistoryResponse,
  MarketQuotesResponse,
  ProviderName,
  ProviderStatus,
  RemoteQuotePatch,
} from '../../src/shared/api.js';
import type { HistoryRange } from '../../src/data/types.js';
import { AlpacaMarketDataProvider } from './alpaca.js';
import { fallbackQuote, fallbackQuotes, sanitizeSymbols } from './catalog.js';
import { getLastKnownGood, storeLastKnownGood } from './last-known-good.js';
import { CoinbaseQuoteProvider } from './providers/coinbase.js';
import { FinnhubQuoteProvider } from './providers/finnhub.js';
import type { QuoteProvider } from './providers/types.js';
import { runQuoteProvider } from './provider-runner.js';
import { reconcileQuoteCandidates, validateQuoteCandidate } from './quality.js';

const MARKET_PROVIDERS: readonly ProviderName[] = Object.freeze(['alpaca', 'finnhub', 'coinbase']);

function providersForConfig(): readonly QuoteProvider[] {
  const config = loadConfig();
  const values: readonly QuoteProvider[] = Object.freeze([
    new AlpacaMarketDataProvider(config),
    new FinnhubQuoteProvider(config),
    new CoinbaseQuoteProvider(config),
  ]);
  for (const provider of values) {
    const mode: DataMode = provider.name === 'alpaca'
      ? config.alpacaFeed === 'delayed_sip' ? 'delayed' : 'live'
      : provider.name === 'finnhub'
        ? config.finnhubMode
        : 'live';
    configureProvider(provider.name, provider.configured, provider.label, mode);
  }
  return values;
}
function bindRequest(quote: RemoteQuotePatch, requestId: string): RemoteQuotePatch {
  return Object.freeze({
    ...quote,
    provenance: Object.freeze({
      ...quote.provenance,
      requestId,
      ingestedAt: new Date().toISOString(),
    }),
  });
}
function responseMode(quotes: readonly RemoteQuotePatch[]): DataMode {
  const modes = [...new Set(quotes.map((quote) => quote.provenance.mode))];
  return modes.length === 0 ? 'fallback' : modes.length === 1 ? modes[0] : 'mixed';
}

async function collectProviderQuotes(
  symbols: readonly string[],
  providers: readonly QuoteProvider[],
): Promise<readonly RemoteQuotePatch[]> {
  const config = loadConfig();
  const primary = providers.find((provider) => provider.name === 'alpaca');
  const secondary = providers.filter((provider) => provider.name !== 'alpaca');
  const collected: RemoteQuotePatch[] = [];

  if (config.marketProviderMode === 'quorum') {
    const runs = await Promise.all(providers.map((provider) => runQuoteProvider(provider, symbols)));
    for (const run of runs) collected.push(...run.quotes);
    return Object.freeze(collected);
  }

  if (primary?.configured) {
    const run = await runQuoteProvider(primary, symbols);
    collected.push(...run.quotes);
  }
  if (config.marketProviderMode === 'primary' && primary?.configured) return Object.freeze(collected);

  const usablePrimary = new Set(
    collected
      .filter((quote) => validateQuoteCandidate(quote, config).valid)
      .filter((quote) => !['stale', 'fallback', 'mock'].includes(quote.provenance.mode))
      .filter((quote) => !['degraded', 'synthetic'].includes(quote.provenance.quality))
      .map((quote) => quote.symbol),
  );
  const missing = symbols.filter((symbol) => !usablePrimary.has(symbol));
  if (!missing.length) return Object.freeze(collected);
  const runs = await Promise.all(secondary.map((provider) => runQuoteProvider(provider, missing)));
  for (const run of runs) collected.push(...run.quotes);
  return Object.freeze(collected);
}

export async function getMarketQuotes(raw: readonly string[], requestId: string): Promise<MarketQuotesResponse> {
  const config = loadConfig();
  const symbols = sanitizeSymbols(raw, 220);
  if (!symbols.length) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하는 심볼이 요청에 포함되지 않았습니다.');

  const providers = providersForConfig();
  const configured = providers.some((provider) => provider.configured);
  if (!configured) {
    if (!config.allowMockFallback) {
      throw new ApiError(503, 'MARKET_DATA_UNAVAILABLE', '시장 데이터 공급자가 설정되지 않았습니다.');
    }
    const quotes = fallbackQuotes(symbols, requestId);
    return Object.freeze({
      requestId,
      generatedAt: new Date().toISOString(),
      mode: 'fallback',
      quotes,
      providers: marketProviderStatuses(),
      warnings: Object.freeze(['외부 시세 공급자가 없어 결정론적 폴백을 사용합니다.']),
    });
  }

  const providerQuotes = await collectProviderQuotes(symbols, providers);
  const quotes: RemoteQuotePatch[] = [];
  const warnings: string[] = [];
  const incidentIds: string[] = [];

  for (const symbol of symbols) {
    const candidates = providerQuotes.filter((quote) => quote.symbol === symbol);
    const reconciled = reconcileQuoteCandidates(symbol, candidates, requestId, config);
    warnings.push(...reconciled.warnings);
    incidentIds.push(...reconciled.incidents.map((incident) => incident.id));

    if (reconciled.quote && reconciled.quote.provenance.quality !== 'degraded') {
      const quote = bindRequest(reconciled.quote, requestId);
      quotes.push(quote);
      await storeLastKnownGood(quote).catch((error: unknown) => {
        logger.warn('market.lkg_write_failed', {
          symbol,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      continue;
    }

    const lastKnownGood = await getLastKnownGood(symbol, requestId).catch(() => null);
    if (lastKnownGood) {
      quotes.push(lastKnownGood);
      warnings.push(`${symbol}은 공급자 이상으로 마지막 검증값을 유지합니다.`);
      const incident = recordIncident({
        kind: 'stale-data',
        severity: 'warning',
        symbol,
        providers: candidates.map((quote) => quote.provenance.source),
        message: `${symbol}에 마지막 검증값을 적용했습니다.`,
        details: { candidateCount: candidates.length },
      });
      incidentIds.push(incident.id);
      continue;
    }

    if (reconciled.quote) {
      quotes.push(bindRequest(reconciled.quote, requestId));
      continue;
    }

    if (config.allowMockFallback) {
      const fallback = fallbackQuote(symbol, requestId);
      if (fallback) {
        quotes.push(fallback);
        warnings.push(`${symbol}은 검증 공급자 값이 없어 명시적 로컬 폴백입니다.`);
      }
    }
  }

  if (!quotes.length) {
    throw new ApiError(503, 'MARKET_DATA_UNAVAILABLE', '검증 가능한 시세나 허용된 폴백이 없습니다.');
  }
  const missingCount = symbols.length - quotes.length;
  if (missingCount > 0) warnings.push(`${missingCount}개 심볼은 사용 가능한 값을 찾지 못했습니다.`);
  return Object.freeze({
    requestId,
    generatedAt: new Date().toISOString(),
    mode: responseMode(quotes),
    quotes: Object.freeze(quotes),
    providers: marketProviderStatuses(),
    warnings: Object.freeze([...new Set(warnings)]),
    ...(incidentIds.length ? { incidentIds: Object.freeze([...new Set(incidentIds)]) } : {}),
  });
}

function fallbackHistory(symbol: string, range: HistoryRange, requestId: string): HistoryResponse {
  const quote = fallbackQuote(symbol, requestId);
  if (!quote) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하지 않는 심볼입니다.');
  const provenance: DataProvenance = Object.freeze({
    ...quote.provenance,
    requestId,
    note: '외부 히스토리를 사용할 수 없어 브라우저의 거래일 캘린더 기반 시계열을 유지합니다.',
  });
  return Object.freeze({
    requestId,
    symbol,
    range,
    candles: Object.freeze([]),
    provenance,
    warning: '외부 히스토리를 사용할 수 없어 로컬 결정론적 차트를 유지합니다.',
  });
}
function staleHistory(value: HistoryResponse, requestId: string): HistoryResponse {
  return Object.freeze({
    ...value,
    requestId,
    provenance: Object.freeze({
      ...value.provenance,
      mode: 'stale',
      quality: 'verified',
      requestId,
      ingestedAt: new Date().toISOString(),
      note: '현재 공급자 장애로 마지막 검증 히스토리를 유지합니다.',
      verification: Object.freeze({
        strategy: 'last-known-good',
        providers: Object.freeze([value.provenance.source]),
        lineageId: value.provenance.verification?.lineageId
          ?? `${value.symbol}:${value.range}:${value.provenance.providerTimestamp}`,
        freshnessSeconds: Math.max(0, (Date.now() - new Date(value.provenance.providerTimestamp).getTime()) / 1000),
        decision: 'stale',
      }),
    }),
    warning: '공급자 장애로 마지막 검증 히스토리를 유지합니다.',
  });
}

export async function getMarketHistory(
  raw: string,
  range: HistoryRange,
  requestId: string,
): Promise<HistoryResponse> {
  const config = loadConfig();
  const symbol = sanitizeSymbols([raw], 1)[0];
  if (!symbol) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하지 않는 심볼입니다.');

  const provider = new AlpacaMarketDataProvider(config);
  configureProvider('alpaca', provider.configured, provider.label, config.alpacaFeed === 'delayed_sip' ? 'delayed' : 'live');
  if (!provider.configured) {
    if (!config.allowMockFallback) {
      throw new ApiError(503, 'HISTORY_PROVIDER_UNAVAILABLE', '히스토리 공급자가 설정되지 않았고 모의 폴백이 비활성입니다.');
    }
    return fallbackHistory(symbol, range, requestId);
  }

  const staleKey = `market:history:lkg:v1:${symbol}:${range}`;
  const circuit = acquireCircuit('alpaca', true);
  if (circuit.state === 'open') {
    const previous = await cacheGet<HistoryResponse>(staleKey);
    if (previous) return staleHistory(previous, requestId);
    if (!config.allowMockFallback) {
      throw new ApiError(503, 'HISTORY_PROVIDER_UNAVAILABLE', '히스토리 공급자 회로가 열려 있고 검증된 이전 값이 없습니다.');
    }
    return fallbackHistory(symbol, range, requestId);
  }

  const started = performance.now();
  try {
    const hit = await cached(
      `market:history:v4:${symbol}:${range}:${config.alpacaFeed}`,
      config.historyCacheSeconds,
      () => provider.fetchHistory(symbol, range),
      config.staleIfErrorSeconds,
      { forceRefresh: circuit.state === 'half-open' },
    );
    if (!hit.value) {
      if (!config.allowMockFallback) {
        throw new ApiError(503, 'HISTORY_PROVIDER_EMPTY', '히스토리 공급자가 사용할 수 있는 데이터를 반환하지 않았습니다.');
      }
      return fallbackHistory(symbol, range, requestId);
    }
    const latency = Math.round((performance.now() - started) * 100) / 100;
    if (hit.stale) {
      circuitFailed('alpaca', new Error('History stale cache served'));
      recordProviderFailure('alpaca', new Error('History stale cache served'), latency);
      return staleHistory(hit.value, requestId);
    }
    const freshnessSeconds = Math.max(
      0,
      (Date.now() - new Date(hit.value.provenance.providerTimestamp).getTime()) / 1000,
    );
    if (hit.cache === 'miss') {
      circuitSucceeded('alpaca');
      recordProviderSuccess('alpaca', latency, {
        mode: hit.value.provenance.mode,
        freshnessSeconds,
        message: `히스토리 ${symbol}/${range} · 실제 공급자 호출 성공`,
      });
    } else {
      recordProviderCacheHit('alpaca', hit.cache, {
        mode: hit.value.provenance.mode,
        freshnessSeconds,
      });
    }
    const response = Object.freeze({
      ...hit.value,
      requestId,
      provenance: Object.freeze({
        ...hit.value.provenance,
        requestId,
        ingestedAt: new Date().toISOString(),
      }),
    });
    await cacheSet(staleKey, response, config.historyStaleSeconds);
    return response;
  } catch (error) {
    const latency = Math.round((performance.now() - started) * 100) / 100;
    circuitFailed('alpaca', error);
    recordProviderFailure('alpaca', error, latency);
    logger.warn('market.history.provider_failed', {
      symbol,
      range,
      message: error instanceof Error ? error.message : String(error),
    });
    const previous = await cacheGet<HistoryResponse>(staleKey);
    if (previous) return staleHistory(previous, requestId);
    if (!config.allowMockFallback) throw error;
    return fallbackHistory(symbol, range, requestId);
  }
}

export function marketProviderStatuses(): readonly ProviderStatus[] {
  providersForConfig();
  return providerStatuses(MARKET_PROVIDERS);
}
export function marketProviderStatus(): ProviderStatus {
  providersForConfig();
  return providerStatus('alpaca');
}
