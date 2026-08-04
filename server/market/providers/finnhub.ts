import type { AppConfig } from '../../config.js';
import type { DataProvenance, RemoteQuotePatch } from '../../../src/shared/api.js';
import { catalogQuote } from '../catalog.js';
import { assetKind } from '../symbols.js';
import { isUsMarketOpenNow } from '../session.js';
import type { QuoteProvider } from './types.js';

type Json = Record<string, unknown>;
function record(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function fetchQuote(symbol: string, config: AppConfig): Promise<RemoteQuotePatch | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const started = performance.now();
  try {
    const url = new URL('https://finnhub.io/api/v1/quote');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', config.finnhubApiKey ?? '');
    const response = await fetch(url, { signal: controller.signal });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);
    if (!record(data)) return null;
    const price = numberValue(data.c);
    const open = numberValue(data.o);
    const high = numberValue(data.h);
    const low = numberValue(data.l);
    const prevClose = numberValue(data.pc);
    const timestamp = numberValue(data.t);
    const local = catalogQuote(symbol);
    if (!local || !price || !open || !high || !low || !prevClose || !timestamp) return null;
    const asOfISO = new Date(timestamp * 1000).toISOString();
    const mode = config.finnhubMode;
    const provenance: DataProvenance = Object.freeze({
      source: 'finnhub',
      sourceLabel: 'Finnhub Quote',
      mode,
      quality: 'provider',
      providerTimestamp: asOfISO,
      ingestedAt: new Date().toISOString(),
      feed: 'quote-rest',
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
      ...(mode === 'delayed' ? { delayedSeconds: 900 } : {}),
      note: '가격과 OHLC는 Finnhub, 거래량은 마지막 검증 카탈로그 값을 유지합니다.',
    });
    return Object.freeze({
      symbol,
      price,
      prevClose,
      open,
      high: Math.max(high, price, open),
      low: Math.min(low, price, open),
      volume: local.volume,
      marketCap: local.marketCap ? local.marketCap * (price / local.price) : undefined,
      asOfISO,
      session: 'regular',
      sessionStatus: isUsMarketOpenNow() ? 'open' : 'closed',
      provenance,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<readonly PromiseSettledResult<R>[]> {
  const result: Array<PromiseSettledResult<R>> = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        result[index] = { status: 'fulfilled', value: await mapper(values[index]) };
      } catch (reason) {
        result[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return Object.freeze(result);
}

export class FinnhubQuoteProvider implements QuoteProvider {
  readonly name = 'finnhub' as const;
  readonly label = 'Finnhub';
  readonly configured: boolean;

  constructor(private readonly config: AppConfig) {
    this.configured = Boolean(config.finnhubApiKey);
  }
  supports(symbol: string): boolean {
    return assetKind(symbol) === 'stock';
  }
  async fetchQuotes(symbols: readonly string[]): Promise<readonly RemoteQuotePatch[]> {
    const supported = symbols.filter((symbol) => this.supports(symbol));
    const settled = await mapConcurrent(supported, 4, (symbol) => fetchQuote(symbol, this.config));
    const values = settled.flatMap((entry) =>
      entry.status === 'fulfilled' && entry.value ? [entry.value] : [],
    );
    if (supported.length && values.length === 0) {
      const failure = settled.find((entry) => entry.status === 'rejected');
      throw failure?.status === 'rejected' && failure.reason instanceof Error
        ? failure.reason
        : new Error('Finnhub returned no usable quotes');
    }
    return Object.freeze(values);
  }
}
