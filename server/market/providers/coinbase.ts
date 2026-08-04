import type { AppConfig } from '../../config.js';
import type { DataProvenance, RemoteQuotePatch } from '../../../src/shared/api.js';
import { catalogQuote } from '../catalog.js';
import { assetKind } from '../symbols.js';
import type { QuoteProvider } from './types.js';

type Json = Record<string, unknown>;
function record(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function numeric(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
function productId(symbol: string): string {
  return symbol.endsWith('USD') ? `${symbol.slice(0, -3)}-USD` : symbol;
}
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Perplexity-Finance/1.4' },
    signal,
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Coinbase HTTP ${response.status}`);
  return data;
}
async function fetchQuote(symbol: string): Promise<RemoteQuotePatch | null> {
  const product = productId(symbol);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const started = performance.now();
  try {
    const [tickerRaw, statsRaw] = await Promise.all([
      fetchJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`, controller.signal),
      fetchJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/stats`, controller.signal),
    ]);
    if (!record(tickerRaw) || !record(statsRaw)) return null;
    const price = numeric(tickerRaw.price) ?? numeric(statsRaw.last);
    const open = numeric(statsRaw.open);
    const high = numeric(statsRaw.high);
    const low = numeric(statsRaw.low);
    const volume = numeric(statsRaw.volume);
    const time = typeof tickerRaw.time === 'string' ? tickerRaw.time : new Date().toISOString();
    const local = catalogQuote(symbol);
    if (!local || !price || !open || !high || !low || volume === undefined) return null;
    const provenance: DataProvenance = Object.freeze({
      source: 'coinbase',
      sourceLabel: 'Coinbase Exchange',
      mode: 'live',
      quality: 'provider',
      providerTimestamp: time,
      ingestedAt: new Date().toISOString(),
      feed: 'exchange-rest',
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
      note: 'Coinbase Exchange ticker와 24시간 stats를 결합한 스냅숏입니다.',
    });
    return Object.freeze({
      symbol,
      price,
      prevClose: open,
      open,
      high: Math.max(high, price, open),
      low: Math.min(low, price, open),
      volume,
      marketCap: local.marketCap ? local.marketCap * (price / local.price) : undefined,
      asOfISO: time,
      session: 'continuous',
      sessionStatus: 'open',
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

export class CoinbaseQuoteProvider implements QuoteProvider {
  readonly name = 'coinbase' as const;
  readonly label = 'Coinbase Exchange';
  readonly configured: boolean;

  constructor(config: AppConfig) {
    this.configured = config.coinbaseEnabled;
  }
  supports(symbol: string): boolean {
    return assetKind(symbol) === 'crypto';
  }
  async fetchQuotes(symbols: readonly string[]): Promise<readonly RemoteQuotePatch[]> {
    const supported = symbols.filter((symbol) => this.supports(symbol));
    const values = await mapConcurrent(supported, 4, fetchQuote);
    const quotes = values.flatMap((entry) =>
      entry.status === 'fulfilled' && entry.value ? [entry.value] : [],
    );
    if (supported.length && quotes.length === 0) {
      const failure = values.find((entry) => entry.status === 'rejected');
      throw failure?.status === 'rejected' && failure.reason instanceof Error
        ? failure.reason
        : new Error('Coinbase returned no usable quotes');
    }
    return Object.freeze(quotes);
  }
}
