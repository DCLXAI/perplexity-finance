/* ============================================================
   MarketEngine — immutable market state with deterministic fallback.

   P1 guarantees:
   - Quote objects and historical bars are immutable snapshots.
   - Each mock-tick interval emits one batched notification.
   - US stocks/indices/futures stay fixed at the Jul 10, 2026 close.
   - Crypto is the only 24/7 asset class receiving local mock ticks.
   - Session-specific snapshots prevent regular/continuous values
     from being silently merged.
   - The engine itself performs no network I/O; P2 runtime adapters can
     atomically ingest verified provider quotes and candles.
   ============================================================ */
import {
  calendarForAsset,
  dailyBarTimestamp,
  intradayBarTimestamps,
  sessionDatesForRange,
} from './calendar.js';
import { bridgePath, gaussian, historyAtTimes, rngFor } from './seed.js';
import { SEED_ASSETS, SNAPSHOT } from './universe.js';
import { KR_SEED_ASSETS, KRW_PER_USD } from './universe.kr.js';
import type { DataProvenance, RemoteCandle, RemoteQuotePatch } from '../shared/api.js';
import type { MarketRegion } from './region.js';
import type {
  CandlePoint,
  HistoryRange,
  InstrumentUnit,
  MarketBatch,
  Quote,
  QuoteSessionSnapshot,
} from './types.js';

/** Both universes merged: symbol lookup spans US tickers and KR codes alike. */
const ALL_SEED_ASSETS = Object.freeze([...SEED_ASSETS, ...KR_SEED_ASSETS]);

/**
 * `marketCap` is always USD (see AssetMeta's doc comment), but `price` is in
 * the asset's native unit. Shares-outstanding math (`marketCap / price`)
 * below needs both sides in the same currency, or it silently produces a
 * count too small by ~`KRW_PER_USD`x for KR-priced assets. USD and KRW are
 * the only units that carry a marketCap today.
 */
function priceInUsd(price: number, unit: InstrumentUnit): number {
  return unit === 'KRW' ? price / KRW_PER_USD : price;
}

type QuoteListener = (quote: Quote) => void;
type BatchListener = (batch: MarketBatch) => void;

const SPARK_POINTS = 80;
const EMPTY_QUOTES: readonly Quote[] = Object.freeze([]);
const EMPTY_CANDLES: readonly CandlePoint[] = Object.freeze([]);
const EQUITY_AS_OF_TS = Math.floor(new Date(SNAPSHOT.asOfISO).getTime() / 1000);
const KR_EQUITY_AS_OF_TS = Math.floor(new Date(SNAPSHOT.krAsOfISO).getTime() / 1000);
const CRYPTO_AS_OF_TS = Math.floor(new Date(SNAPSHOT.cryptoAsOfISO).getTime() / 1000);

/** Korean equities were captured a session after the US anchor (see universe.kr.ts) — route non-crypto quotes through the right as-of by region rather than always assuming the US close. */
function equityAsOfISO(region: MarketRegion): string {
  return region === 'KR' ? SNAPSHOT.krAsOfISO : SNAPSHOT.asOfISO;
}

function equityAsOfTs(region: MarketRegion): number {
  return region === 'KR' ? KR_EQUITY_AS_OF_TS : EQUITY_AS_OF_TS;
}

function localProvenance(asOfISO: string): DataProvenance {
  return Object.freeze({
    source: 'local-simulation',
    sourceLabel: 'P1 결정론적 로컬 엔진',
    mode: 'mock',
    quality: 'synthetic',
    providerTimestamp: asOfISO,
    ingestedAt: new Date().toISOString(),
    feed: 'deterministic-local',
    note: '외부 공급자 데이터가 아닙니다.',
  });
}

function freezeSession(session: QuoteSessionSnapshot): QuoteSessionSnapshot {
  return Object.freeze({ ...session });
}

function freezeQuote(quote: Quote): Quote {
  const sessions = Object.freeze({
    ...(quote.sessions.regular ? { regular: freezeSession(quote.sessions.regular) } : {}),
    ...(quote.sessions.continuous ? { continuous: freezeSession(quote.sessions.continuous) } : {}),
    ...(quote.sessions.afterHours ? { afterHours: freezeSession(quote.sessions.afterHours) } : {}),
  });
  return Object.freeze({
    ...quote,
    spark: Object.freeze([...quote.spark]),
    sessions,
  });
}

function freezeCandles(candles: readonly CandlePoint[]): readonly CandlePoint[] {
  return Object.freeze(candles.map((candle) => Object.freeze({ ...candle })));
}

function freezeQuoteList(quotes: readonly Quote[]): readonly Quote[] {
  return Object.freeze([...quotes]);
}

function buildQuote(seed: (typeof SEED_ASSETS)[number]): Quote {
  const prevClose = seed.price / (1 + seed.changePct / 100);
  const gapRng = rngFor(`open:${seed.symbol}`);
  const gapVol =
    seed.kind === 'crypto'
      ? 0.004
      : seed.kind === 'future' || seed.kind === 'index'
        ? 0.0015
        : 0.006;
  const open = prevClose * (1 + gapVol * gaussian(gapRng));
  const pathVol =
    seed.kind === 'crypto'
      ? 0.006
      : seed.kind === 'future' || seed.kind === 'index'
        ? 0.0012
        : Math.min(0.012, 0.003 + Math.abs(seed.changePct) * 0.0012);
  const spark = bridgePath(`spark:${seed.symbol}`, open, seed.price, SPARK_POINTS, pathVol);
  let high = Math.max(open, seed.price);
  let low = Math.min(open, seed.price);
  for (const point of spark) {
    if (point > high) high = point;
    if (point < low) low = point;
  }

  const volumeRng = rngFor(`vol:${seed.symbol}`);
  const volume =
    seed.kind === 'stock' || seed.kind === 'etf'
      ? Math.round(
          ((seed.marketCap ?? 1e10) / priceInUsd(seed.price, seed.unit)) *
            (0.004 + volumeRng() * 0.012),
        )
      : seed.kind === 'index'
        ? 0
        : Math.round(1e5 + volumeRng() * 9e5);

  const activeSession: QuoteSessionSnapshot = {
    kind: seed.kind === 'crypto' ? 'continuous' : 'regular',
    status: seed.kind === 'crypto' ? 'open' : 'closed',
    asOfISO: seed.kind === 'crypto' ? SNAPSHOT.cryptoAsOfISO : equityAsOfISO(seed.region),
    price: seed.price,
    volume,
    high,
    low,
    open,
  };

  return freezeQuote({
    ...seed,
    prevClose,
    change: seed.price - prevClose,
    changePct: seed.changePct,
    volume,
    dayHigh: high,
    dayLow: low,
    open,
    spark,
    seq: 0,
    provenance: localProvenance(seed.kind === 'crypto' ? SNAPSHOT.cryptoAsOfISO : equityAsOfISO(seed.region)),
    sessions:
      seed.kind === 'crypto'
        ? { continuous: activeSession }
        : { regular: activeSession },
  });
}

function historyProfile(quote: Quote): {
  drift: number;
  volatility: number;
  periodsPerYear: number;
  volumeScale: number;
} {
  if (quote.kind === 'crypto') {
    return {
      drift: -0.1,
      volatility: 0.55,
      periodsPerYear: 365,
      volumeScale: Math.max(50_000, quote.volume / 2),
    };
  }
  if (quote.kind === 'future') {
    return {
      drift: 0.08,
      volatility: 0.2,
      periodsPerYear: 260,
      volumeScale: Math.max(20_000, quote.volume / 2),
    };
  }
  if (quote.kind === 'index') {
    return { drift: 0.12, volatility: 0.16, periodsPerYear: 252, volumeScale: 1 };
  }
  return {
    drift: 0.22,
    volatility: 0.34,
    periodsPerYear: 252,
    volumeScale: Math.max(100_000, quote.volume / 2),
  };
}

export class MarketEngine {
  private quotes = new Map<string, Quote>();
  private listeners = new Map<string, Set<QuoteListener>>();
  private batchListeners = new Set<BatchListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickRng = rngFor('live-crypto-ticks');
  private histCache = new Map<string, readonly CandlePoint[]>();
  private order: string[] = [];
  private liveOrder: string[] = [];
  private unitsOutstanding = new Map<string, number>();
  private allSnapshot: readonly Quote[] = EMPTY_QUOTES;
  private batchSequence = 0;
  private externalFeedActive = false;
  private externallyManagedUntil = new Map<string, number>();

  constructor() {
    for (const seed of ALL_SEED_ASSETS) {
      const quote = buildQuote(seed);
      this.quotes.set(seed.symbol, quote);
      this.order.push(seed.symbol);
      if (seed.kind === 'crypto') this.liveOrder.push(seed.symbol);
      if (seed.marketCap !== undefined && seed.price > 0) {
        this.unitsOutstanding.set(seed.symbol, seed.marketCap / priceInUsd(seed.price, seed.unit));
      }
    }
    this.refreshAllSnapshot();
  }

  private refreshAllSnapshot(): void {
    this.allSnapshot = Object.freeze(this.order.map((symbol) => this.quotes.get(symbol)!));
  }

  /* ---------- queries ---------- */

  /**
   * Symbol lookup across both universes — no region parameter. `AssetMeta`
   * carries its own region, so a six-digit KR code and an alphabetic US
   * ticker each resolve here without the caller knowing which market it's in.
   *
   * `getQuote` and `quote` are the same lookup under two names: `getQuote`
   * predates the region model and has ~15 existing call sites across the
   * codebase; `quote` is the name the region-resolution test (and the
   * design brief) uses. Both are kept rather than a mass rename that would
   * touch files outside this task's scope.
   */
  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  /** Alias of `getQuote` — see the doc comment above for why both names exist. */
  quote(symbol: string): Quote | undefined {
    return this.getQuote(symbol);
  }

  /** All assets listed by one region, frozen. Region scopes listings, not lookups. */
  listAssets(region: MarketRegion): readonly Quote[] {
    return freezeQuoteList(this.allSnapshot.filter((quote) => quote.region === region));
  }

  getQuotes(symbols: readonly string[]): readonly Quote[] {
    const out: Quote[] = [];
    for (const symbol of symbols) {
      const quote = this.quotes.get(symbol);
      if (quote) out.push(quote);
    }
    return Object.freeze(out);
  }

  /** Every quote, or one region's, matching `listAssets`'s parameter shape. */
  getAll(region?: MarketRegion): readonly Quote[] {
    return region === undefined ? this.allSnapshot : this.listAssets(region);
  }

  getStocks(region?: MarketRegion): readonly Quote[] {
    return freezeQuoteList(
      this.allSnapshot.filter(
        (quote) => quote.kind === 'stock' && (region === undefined || quote.region === region),
      ),
    );
  }

  getCrypto(): readonly Quote[] {
    return freezeQuoteList(this.allSnapshot.filter((quote) => quote.kind === 'crypto'));
  }

  getSequence(): number {
    return this.batchSequence;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  isExternalFeedActive(): boolean {
    return this.externalFeedActive;
  }

  setExternalFeedActive(active: boolean): void {
    this.externalFeedActive = active;
    if (active) this.stop();
    else if (typeof document === 'undefined' || !document.hidden) this.start();
  }

  /** Top movers among stocks with market cap >= minCap, optionally scoped to one region. */
  movers(
    direction: 'up' | 'down' | 'active',
    limit = 8,
    minCap = 0,
    region?: MarketRegion,
  ): readonly Quote[] {
    const stocks = this.getStocks(region).filter((quote) => (quote.marketCap ?? 0) >= minCap);
    if (direction === 'active') {
      // Dollar value traded (volume * price) must be compared in one currency —
      // `price` is native-unit (KRW for KR rows), so normalize before ranking.
      return freezeQuoteList(
        [...stocks]
          .sort(
            (a, b) =>
              b.volume * priceInUsd(b.price, b.unit) - a.volume * priceInUsd(a.price, a.unit),
          )
          .slice(0, limit),
      );
    }
    return freezeQuoteList(
      [...stocks]
        .sort((a, b) =>
          direction === 'up' ? b.changePct - a.changePct : a.changePct - b.changePct,
        )
        .slice(0, limit),
    );
  }

  search(term: string, limit = 12, region?: MarketRegion): readonly Quote[] {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return EMPTY_QUOTES;
    const scored: { quote: Quote; score: number }[] = [];
    for (const quote of this.quotes.values()) {
      if (region !== undefined && quote.region !== region) continue;
      const symbol = quote.symbol.toLowerCase();
      const name = quote.name.toLowerCase();
      const koreanName = (quote.nameKo ?? '').toLowerCase();
      let score = -1;
      if (symbol === normalized) score = 100;
      else if (symbol.startsWith(normalized)) score = 80;
      else if (name.startsWith(normalized) || koreanName.startsWith(normalized)) score = 60;
      else if (symbol.includes(normalized)) score = 40;
      else if (name.includes(normalized) || koreanName.includes(normalized)) score = 20;
      if (score >= 0) scored.push({ quote, score: score + (quote.marketCap ?? 0) / 1e13 });
    }
    return freezeQuoteList(
      scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ quote }) => quote),
    );
  }

  /* ---------- history ---------- */

  getHistory(symbol: string, range: HistoryRange): readonly CandlePoint[] {
    const key = `${symbol}:${range}`;
    const cached = this.histCache.get(key);
    if (cached) return cached;

    const quote = this.quotes.get(symbol);
    if (!quote) return EMPTY_CANDLES;

    const calendar = calendarForAsset(quote.kind, quote.region);
    const asOfISO = quote.kind === 'crypto' ? SNAPSHOT.cryptoAsOfISO : equityAsOfISO(quote.region);
    const endDateISO = asOfISO.slice(0, 10);
    const endTimestamp = quote.kind === 'crypto' ? CRYPTO_AS_OF_TS : equityAsOfTs(quote.region);
    let candles: CandlePoint[];

    if (range === '1D' || range === '5D' || range === '7D') {
      const times = intradayBarTimestamps(calendar, endDateISO, endTimestamp, range);
      const rng = rngFor(`intraday:${symbol}:${range}`);
      const startPrice =
        range === '1D'
          ? quote.open
          : quote.price * (1 + (rng() - 0.5) * (quote.kind === 'crypto' ? 0.12 : 0.05));
      const path = bridgePath(
        `intraday-path:${symbol}:${range}`,
        startPrice,
        quote.price,
        times.length + 1,
        quote.kind === 'crypto' ? 0.0022 : 0.0014,
      );
      const volumePerBar = Math.max(1, quote.volume / Math.max(1, times.length));
      candles = times.map((time, index) => {
        const open = path[index];
        const close = path[index + 1];
        const high = Math.max(open, close) * (1 + Math.abs(0.0012 * gaussian(rng)));
        const low = Math.min(open, close) * (1 - Math.abs(0.0012 * gaussian(rng)));
        const volume = Math.max(1, Math.round(volumePerBar * (0.55 + rng())));
        return { time, open, high, low, close, volume };
      });
    } else {
      const dates = sessionDatesForRange(calendar, endDateISO, range);
      const times = dates.map((date) => dailyBarTimestamp(calendar, date));
      const profile = historyProfile(quote);
      candles = historyAtTimes(
        `daily:${symbol}:${range}`,
        quote.price,
        times,
        profile.drift,
        profile.volatility,
        profile.periodsPerYear,
        profile.volumeScale,
      );
    }

    const frozen = freezeCandles(candles);
    this.histCache.set(key, frozen);
    return frozen;
  }


  applyExternalQuotes(patches: readonly RemoteQuotePatch[]): MarketBatch | null {
    const changed: Quote[] = [];
    let latestISO = '';
    for (const patch of patches) {
      const previous = this.quotes.get(patch.symbol);
      if (!previous) continue;
      if (patch.provenance.source === 'local-simulation' && previous.provenance.source !== 'local-simulation') continue;
      const values = [patch.price, patch.prevClose, patch.open, patch.high, patch.low, patch.volume];
      if (!values.every(Number.isFinite) || patch.price <= 0 || patch.prevClose <= 0) continue;
      const high = Math.max(patch.high, patch.open, patch.price);
      const low = Math.min(patch.low, patch.open, patch.price);
      if (low <= 0) continue;
      const session: QuoteSessionSnapshot = {
        kind: patch.session,
        status: patch.sessionStatus,
        asOfISO: patch.asOfISO,
        price: patch.price,
        volume: Math.max(0, patch.volume),
        high,
        low,
        open: patch.open,
      };
      const sessionKey = patch.session === 'continuous' ? 'continuous' : patch.session === 'after-hours' ? 'afterHours' : 'regular';
      const units = this.unitsOutstanding.get(patch.symbol);
      const marketCap = patch.marketCap && patch.marketCap > 0 ? patch.marketCap : units ? units * patch.price : previous.marketCap;
      const updated = freezeQuote({
        ...previous,
        price: patch.price,
        prevClose: patch.prevClose,
        change: patch.price - patch.prevClose,
        changePct: ((patch.price - patch.prevClose) / patch.prevClose) * 100,
        open: patch.open,
        dayHigh: high,
        dayLow: low,
        volume: Math.max(0, patch.volume),
        marketCap,
        spark: previous.spark.length >= SPARK_POINTS ? [...previous.spark.slice(1), patch.price] : [...previous.spark, patch.price],
        seq: previous.seq + 1,
        provenance: patch.provenance,
        sessions: { ...previous.sessions, [sessionKey]: session },
      });
      this.quotes.set(patch.symbol, updated);
      if (patch.provenance.source !== 'local-simulation') this.externallyManagedUntil.set(patch.symbol, Date.now() + 90_000);
      this.syncCachedHistory(updated, 0);
      changed.push(updated);
      if (!latestISO || patch.asOfISO > latestISO) latestISO = patch.asOfISO;
    }
    return changed.length ? this.publish(changed, latestISO || new Date().toISOString()) : null;
  }

  replaceExternalHistory(symbol: string, range: HistoryRange, candles: readonly RemoteCandle[], provenance: DataProvenance): readonly CandlePoint[] {
    if (!this.quotes.has(symbol)) return EMPTY_CANDLES;
    const normalized = candles
      .filter((c) => [c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.time > 0 && c.low > 0)
      .map((c) => ({ ...c, high: Math.max(c.high,c.open,c.close), low: Math.min(c.low,c.open,c.close), volume: Math.max(0,c.volume), provenance }))
      .sort((a,b)=>a.time-b.time);
    if (!normalized.length) return EMPTY_CANDLES;
    const frozen=freezeCandles(normalized);
    this.histCache.set(`${symbol}:${range}`,frozen);
    return frozen;
  }

  /* ---------- subscriptions ---------- */

  subscribe(symbol: string, callback: QuoteListener): () => void {
    let listeners = this.listeners.get(symbol);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(symbol, listeners);
    }
    listeners.add(callback);
    return () => {
      listeners?.delete(callback);
      if (listeners?.size === 0) this.listeners.delete(symbol);
    };
  }

  /** One callback per engine tick, regardless of how many symbols changed. */
  subscribeAll(callback: BatchListener): () => void {
    this.batchListeners.add(callback);
    return () => this.batchListeners.delete(callback);
  }


  private publish(changed: readonly Quote[], asOfISO: string): MarketBatch {
    this.refreshAllSnapshot();
    for (const quote of changed) {
      const symbolListeners=this.listeners.get(quote.symbol);
      if (symbolListeners) for (const callback of symbolListeners) callback(quote);
    }
    const batch:MarketBatch=Object.freeze({sequence:++this.batchSequence,occurredAt:Date.now(),asOfISO,changedSymbols:Object.freeze(changed.map((q)=>q.symbol)),quotes:Object.freeze([...changed])});
    for (const callback of this.batchListeners) callback(batch);
    return batch;
  }

  /* ---------- 24/7 crypto-only mock ticks ---------- */

  start(): void {
    if (this.externalFeedActive || this.timer || this.liveOrder.length === 0) return;
    this.timer = setInterval(() => this.runMockTick(), 700);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private syncCachedHistory(quote: Quote, volumeDelta: number): void {
    for (const [key, candles] of this.histCache) {
      if (!key.startsWith(`${quote.symbol}:`) || candles.length === 0) continue;
      const last = candles[candles.length - 1];
      const nextLast: CandlePoint = Object.freeze({
        ...last,
        close: quote.price,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
        volume: last.volume + volumeDelta,
      });
      this.histCache.set(
        key,
        Object.freeze([...candles.slice(0, -1), nextLast]),
      );
    }
  }

  /**
   * Runs one deterministic mock tick and returns the emitted batch.
   * Public for data validation/tests; production callers normally use start().
   */
  runMockTick(): MarketBatch | null {
    if (this.externalFeedActive || this.liveOrder.length === 0) return null;

    const now = Date.now();
    const available = this.liveOrder.filter((symbol) => (this.externallyManagedUntil.get(symbol) ?? 0) <= now);
    if (available.length === 0) return null;

    const desiredCount = Math.min(available.length, 3 + Math.floor(this.tickRng() * 5));
    const selected = new Set<string>();
    while (selected.size < desiredCount) {
      selected.add(available[Math.floor(this.tickRng() * available.length)]);
    }

    const tickISO = new Date().toISOString();
    const changed: Quote[] = [];
    for (const symbol of selected) {
      const quote = this.quotes.get(symbol);
      if (!quote) continue;

      const next = quote.price * (1 + 0.0009 * gaussian(this.tickRng));
      const volumeDelta = Math.max(1, Math.round(this.tickRng() * 4000));
      const nextVolume = quote.volume + volumeDelta;
      const nextHigh = Math.max(quote.dayHigh, next);
      const nextLow = Math.min(quote.dayLow, next);
      const units = this.unitsOutstanding.get(symbol);
      const continuous: QuoteSessionSnapshot = {
        kind: 'continuous',
        status: 'open',
        asOfISO: tickISO,
        price: next,
        volume: nextVolume,
        high: nextHigh,
        low: nextLow,
        open: quote.open,
      };
      const updated = freezeQuote({
        ...quote,
        price: next,
        change: next - quote.prevClose,
        changePct: ((next - quote.prevClose) / quote.prevClose) * 100,
        dayHigh: nextHigh,
        dayLow: nextLow,
        volume: nextVolume,
        marketCap: units !== undefined ? units * next : quote.marketCap,
        spark:
          quote.spark.length >= SPARK_POINTS
            ? [...quote.spark.slice(1), next]
            : [...quote.spark, next],
        seq: quote.seq + 1,
        provenance: localProvenance(tickISO),
        sessions: { ...quote.sessions, continuous },
      });

      this.quotes.set(symbol, updated);
      this.syncCachedHistory(updated, volumeDelta);
      changed.push(updated);
    }

    if (changed.length === 0) return null;
    return this.publish(changed, tickISO);
  }
}

export const engine = new MarketEngine();

if (typeof document !== 'undefined') {
  const syncVisibility = () => {
    if (document.hidden) engine.stop();
    else engine.start();
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
}
