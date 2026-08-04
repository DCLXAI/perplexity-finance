import type { AppConfig } from '../config.js';
import type {
  DataMode,
  DataProvenance,
  HistoryResponse,
  RemoteCandle,
  RemoteQuotePatch,
} from '../../src/shared/api.js';
import { isUsEquityTradingDay } from '../../src/data/calendar.js';
import type { HistoryRange } from '../../src/data/types.js';
import { catalogQuote } from './catalog.js';
import { assetKind, fromAlpacaSymbol, isAlpacaSupported, toAlpacaSymbol } from './symbols.js';
import type { QuoteProvider } from './providers/types.js';

type Json = Record<string, unknown>;
interface Bar { t: string; o: number; h: number; l: number; c: number; v: number }
interface Snapshot {
  latestTrade?: { t: string; p: number };
  minuteBar?: Bar;
  dailyBar?: Bar;
  prevDailyBar?: Bar;
}

function record(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function positive(value: unknown): number | undefined {
  const parsed = finite(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
function parseBar(value: unknown): Bar | undefined {
  if (!record(value) || typeof value.t !== 'string') return undefined;
  const open = positive(value.o);
  const high = positive(value.h);
  const low = positive(value.l);
  const close = positive(value.c);
  const volume = finite(value.v);
  if (open === undefined || high === undefined || low === undefined || close === undefined || volume === undefined || volume < 0) {
    return undefined;
  }
  return {
    t: value.t,
    o: open,
    h: Math.max(high, open, close),
    l: Math.min(low, open, close),
    c: close,
    v: volume,
  };
}
function parseSnapshot(value: unknown): Snapshot | undefined {
  if (!record(value)) return undefined;
  const latestPrice = record(value.latestTrade) ? positive(value.latestTrade.p) : undefined;
  const latest = record(value.latestTrade) && typeof value.latestTrade.t === 'string' && latestPrice !== undefined
    ? { t: value.latestTrade.t, p: latestPrice }
    : undefined;
  return {
    ...(latest ? { latestTrade: latest } : {}),
    ...(parseBar(value.minuteBar) ? { minuteBar: parseBar(value.minuteBar) } : {}),
    ...(parseBar(value.dailyBar) ? { dailyBar: parseBar(value.dailyBar) } : {}),
    ...(parseBar(value.prevDailyBar) ? { prevDailyBar: parseBar(value.prevDailyBar) } : {}),
  };
}
function stockOpenNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  const hour = Number(get('hour')) % 24;
  const minutes = hour * 60 + Number(get('minute'));
  return isUsEquityTradingDay(date) && minutes >= 570 && minutes < 960;
}
function provenance(
  config: AppConfig,
  kind: 'stock' | 'crypto',
  timestamp: string,
  latencyMs: number,
): DataProvenance {
  const mode: DataMode = config.alpacaFeed === 'delayed_sip' ? 'delayed' : 'live';
  return Object.freeze({
    source: 'alpaca',
    sourceLabel: 'Alpaca Market Data',
    mode,
    quality: 'provider',
    providerTimestamp: timestamp,
    ingestedAt: new Date().toISOString(),
    feed: kind === 'crypto' ? 'crypto-us' : config.alpacaFeed,
    latencyMs,
    ...(mode === 'delayed' ? { delayedSeconds: 900 } : {}),
    ...(kind === 'stock' && config.alpacaFeed === 'iex' ? { note: 'IEX feed snapshot' } : {}),
  });
}

interface HistorySpec {
  readonly timeframe: '15Min' | '1Day';
  readonly start: string;
  /** Intraday ranges have an exact bar budget. Calendar ranges keep every returned bar. */
  readonly maxBars?: number;
}

function subtractUtcMonths(value: Date, months: number): Date {
  const copy = new Date(value);
  const day = copy.getUTCDate();
  copy.setUTCDate(1);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate();
  copy.setUTCDate(Math.min(day, lastDay));
  return copy;
}

export function historySpec(range: HistoryRange, kind: 'stock' | 'crypto', now = new Date()): HistorySpec {
  const start = new Date(now);
  if (range === '1D' || range === '5D' || range === '7D') {
    const days = range === '1D' ? 7 : range === '5D' ? 14 : 21;
    start.setUTCDate(start.getUTCDate() - days);
    const sessionBars = range === '1D' ? 1 : range === '5D' ? 5 : 7;
    return {
      timeframe: '15Min',
      start: start.toISOString(),
      maxBars: sessionBars * (kind === 'crypto' ? 96 : 26),
    };
  }
  if (range === 'YTD') {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === '1M') {
    return { timeframe: '1Day', start: subtractUtcMonths(now, 1).toISOString() };
  } else if (range === '6M') {
    return { timeframe: '1Day', start: subtractUtcMonths(now, 6).toISOString() };
  } else if (range === '1Y') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 5);
  }
  return { timeframe: '1Day', start: start.toISOString() };
}

async function fetchJson(url: string, config: AppConfig): Promise<{ data: unknown; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': config.alpacaKeyId ?? '',
        'APCA-API-SECRET-KEY': config.alpacaSecretKey ?? '',
      },
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = record(data) && typeof data.message === 'string' ? data.message : 'request failed';
      throw new Error(`Alpaca HTTP ${response.status}: ${message}`);
    }
    return { data, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
  } finally {
    clearTimeout(timer);
  }
}
function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return Object.freeze(output.map((batch) => Object.freeze(batch)));
}
function snapshotsRoot(data: unknown): Json | undefined {
  if (!record(data)) return undefined;
  return record(data.snapshots) ? data.snapshots : data;
}
function snapshotPatch(
  config: AppConfig,
  rawSymbol: string,
  value: unknown,
  kind: 'stock' | 'crypto',
  latencyMs: number,
): RemoteQuotePatch | undefined {
  const snapshot = parseSnapshot(value);
  const symbol = fromAlpacaSymbol(rawSymbol);
  const local = catalogQuote(symbol);
  const daily = snapshot?.dailyBar;
  const previous = snapshot?.prevDailyBar;
  if (!snapshot || !local || !daily || !previous) return undefined;
  const price = snapshot.latestTrade?.p ?? snapshot.minuteBar?.c ?? daily.c;
  const timestamp = snapshot.latestTrade?.t ?? snapshot.minuteBar?.t ?? daily.t;
  if (!Number.isFinite(new Date(timestamp).getTime())) return undefined;
  return Object.freeze({
    symbol,
    price,
    prevClose: previous.c,
    open: daily.o,
    high: Math.max(daily.h, price, daily.o),
    low: Math.min(daily.l, price, daily.o),
    volume: daily.v,
    ...(local.marketCap && local.price > 0 ? { marketCap: local.marketCap * (price / local.price) } : {}),
    asOfISO: timestamp,
    session: kind === 'crypto' ? 'continuous' : 'regular',
    sessionStatus: kind === 'crypto' ? 'open' : stockOpenNow() ? 'open' : 'closed',
    provenance: provenance(config, kind, timestamp, latencyMs),
  });
}

export class AlpacaMarketDataProvider implements QuoteProvider {
  readonly name = 'alpaca' as const;
  readonly label = 'Alpaca Market Data';
  readonly configured: boolean;

  constructor(private readonly config: AppConfig) {
    this.configured = Boolean(config.alpacaKeyId && config.alpacaSecretKey);
  }
  supports(symbol: string): boolean {
    return isAlpacaSupported(symbol);
  }
  async fetchQuotes(symbols: readonly string[]): Promise<readonly RemoteQuotePatch[]> {
    const supported = symbols.filter(isAlpacaSupported);
    const stocks = supported.filter((symbol) => assetKind(symbol) === 'stock');
    const crypto = supported.filter((symbol) => assetKind(symbol) === 'crypto');
    const tasks: Promise<readonly RemoteQuotePatch[]>[] = [];

    for (const batch of chunks(stocks, 80)) {
      tasks.push((async () => {
        const url = new URL('https://data.alpaca.markets/v2/stocks/snapshots');
        url.searchParams.set('symbols', batch.join(','));
        url.searchParams.set('feed', this.config.alpacaFeed);
        const { data, latencyMs } = await fetchJson(url.toString(), this.config);
        const root = snapshotsRoot(data);
        if (!root) return Object.freeze([]);
        return Object.freeze(Object.entries(root).flatMap(([raw, value]) => {
          const patch = snapshotPatch(this.config, raw, value, 'stock', latencyMs);
          return patch ? [patch] : [];
        }));
      })());
    }
    for (const batch of chunks(crypto, 80)) {
      tasks.push((async () => {
        const url = new URL('https://data.alpaca.markets/v1beta3/crypto/us/snapshots');
        url.searchParams.set('symbols', batch.map(toAlpacaSymbol).join(','));
        const { data, latencyMs } = await fetchJson(url.toString(), this.config);
        const root = snapshotsRoot(data);
        if (!root) return Object.freeze([]);
        return Object.freeze(Object.entries(root).flatMap(([raw, value]) => {
          const patch = snapshotPatch(this.config, raw, value, 'crypto', latencyMs);
          return patch ? [patch] : [];
        }));
      })());
    }

    const settled = await Promise.allSettled(tasks);
    const quotes = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    if (supported.length && quotes.length === 0) {
      const failure = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      throw failure?.reason instanceof Error ? failure.reason : new Error('Alpaca returned no usable quotes');
    }
    return Object.freeze(quotes);
  }
  async fetchHistory(symbol: string, range: HistoryRange): Promise<HistoryResponse | null> {
    if (!isAlpacaSupported(symbol)) return null;
    const kind = assetKind(symbol);
    if (kind === 'unsupported') return null;
    const mapped = toAlpacaSymbol(symbol);
    const spec = historySpec(range, kind);
    const path = kind === 'crypto'
      ? 'https://data.alpaca.markets/v1beta3/crypto/us/bars'
      : 'https://data.alpaca.markets/v2/stocks/bars';
    const url = new URL(path);
    url.searchParams.set('symbols', mapped);
    url.searchParams.set('timeframe', spec.timeframe);
    url.searchParams.set('start', spec.start);
    url.searchParams.set('limit', '10000');
    if (kind === 'stock') {
      url.searchParams.set('feed', this.config.alpacaFeed);
      url.searchParams.set('adjustment', 'all');
    }
    const { data, latencyMs } = await fetchJson(url.toString(), this.config);
    const barsRoot = record(data) && record(data.bars) ? data.bars : undefined;
    const raw = barsRoot?.[mapped] ?? barsRoot?.[symbol];
    if (!Array.isArray(raw)) return null;
    const startSeconds = Math.floor(new Date(spec.start).getTime() / 1000);
    const byTime = new Map<number, RemoteCandle>();
    for (const value of raw) {
      const bar = parseBar(value);
      if (!bar) continue;
      const time = Math.floor(new Date(bar.t).getTime() / 1000);
      if (!Number.isFinite(time) || time < startSeconds) continue;
      byTime.set(time, Object.freeze({
        time,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));
    }
    const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
    const selected = spec.maxBars === undefined ? candles : candles.slice(-spec.maxBars);
    const trimmed = Object.freeze(selected);
    if (!trimmed.length) return null;
    const timestamp = new Date(trimmed[trimmed.length - 1].time * 1000).toISOString();
    return Object.freeze({
      requestId: '',
      symbol,
      range,
      candles: trimmed,
      provenance: provenance(this.config, kind, timestamp, latencyMs),
    });
  }
}
