/* ============================================================
   React bindings for the immutable MarketEngine + validated,
   cross-tab-synchronised browser persistence.
   ============================================================ */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { engine } from './engine.js';
import { parseJson, parseTheme, sanitizeWatchlist, type ThemeName } from './persistence.js';
import { DEFAULT_WATCHLIST } from './universe.js';
import type { MarketBatch, Quote } from './types.js';
import { useLiveSymbols } from '@/live/marketRuntime';

/** Subscribed quote for one symbol; the snapshot reference changes only on that symbol's tick. */
export function useQuote(symbol: string): Quote | undefined {
  useLiveSymbols([symbol]);
  return useSyncExternalStore(
    (onChange) => engine.subscribe(symbol, onChange),
    () => engine.getQuote(symbol),
    () => engine.getQuote(symbol),
  );
}

/** Subscribed quotes for a list of symbols, throttled. */
export function useQuotes(symbols: readonly string[], throttleMs = 900): readonly Quote[] {
  useLiveSymbols(symbols);
  const key = symbols.join(',');
  const [version, force] = useState(0);
  const dirty = useRef(false);

  useEffect(() => {
    const watched = new Set(symbols);
    let last = 0;
    let raf = 0;
    const unsubscribe = engine.subscribeAll((batch: MarketBatch) => {
      if (!batch.changedSymbols.some((symbol) => watched.has(symbol))) return;
      dirty.current = true;
      const now = performance.now();
      if (now - last >= throttleMs && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          last = performance.now();
          dirty.current = false;
          force((current) => current + 1);
        });
      }
    });
    const interval = window.setInterval(() => {
      if (dirty.current) {
        dirty.current = false;
        force((current) => current + 1);
      }
    }, throttleMs + 200);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      if (raf) cancelAnimationFrame(raf);
    };
    // The joined symbol key intentionally represents list identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, throttleMs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => engine.getQuotes(symbols), [key, version]);
}

/** Every quote in the universe, throttled to one render per interval. */
const ALL_LIVE_SYMBOLS: readonly string[] = Object.freeze(engine.getAll().map((quote) => quote.symbol));

export function useAllQuotes(throttleMs = 1200): readonly Quote[] {
  useLiveSymbols(ALL_LIVE_SYMBOLS);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let dirty = false;
    const unsubscribe = engine.subscribeAll(() => {
      dirty = true;
    });
    const interval = window.setInterval(() => {
      if (dirty) {
        dirty = false;
        setVersion((current) => current + 1);
      }
    }, throttleMs);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [throttleMs]);
  // The engine returns one stable immutable array snapshot per batch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => engine.getAll(), [version]);
}

/* ---------- watchlist ---------- */

const WATCHLIST_KEY = 'pf-watchlist-v1';
const SERVER_DEFAULT_WATCHLIST: readonly string[] = Object.freeze([...DEFAULT_WATCHLIST]);
const KNOWN_SYMBOLS = new Set(engine.getAll().map((quote) => quote.symbol));
let watchlistCache: readonly string[] | null = null;
const watchlistListeners = new Set<() => void>();

export interface WatchlistCloudAdapter {
  save(symbols: readonly string[]): Promise<void>;
}

let watchlistCloudAdapter: WatchlistCloudAdapter | null = null;
let suppressCloudWatchlistWrite = false;

function storageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function decodeWatchlist(raw: string | null): readonly string[] {
  return sanitizeWatchlist(parseJson(raw), KNOWN_SYMBOLS, DEFAULT_WATCHLIST);
}

function loadWatchlist(): readonly string[] {
  if (watchlistCache) return watchlistCache;
  watchlistCache = decodeWatchlist(storageOrNull()?.getItem(WATCHLIST_KEY) ?? null);
  return watchlistCache;
}

function notifyWatchlist(): void {
  for (const listener of watchlistListeners) listener();
}

function saveWatchlist(list: readonly string[], syncCloud = true): void {
  watchlistCache = sanitizeWatchlist(list, KNOWN_SYMBOLS, DEFAULT_WATCHLIST);
  try {
    storageOrNull()?.setItem(WATCHLIST_KEY, JSON.stringify(watchlistCache));
  } catch {
    // Storage can be disabled or quota-limited; in-memory state still works.
  }
  notifyWatchlist();
  if (syncCloud && !suppressCloudWatchlistWrite && watchlistCloudAdapter) {
    void watchlistCloudAdapter.save(watchlistCache).catch((error: unknown) => {
      console.warn('[watchlist-cloud-save]', error);
    });
  }
}

export function getWatchlistSnapshot(): readonly string[] {
  return loadWatchlist();
}

export function replaceWatchlistFromCloud(symbols: readonly string[]): void {
  suppressCloudWatchlistWrite = true;
  try {
    saveWatchlist(symbols, false);
  } finally {
    suppressCloudWatchlistWrite = false;
  }
}

export function setWatchlistCloudAdapter(adapter: WatchlistCloudAdapter | null): void {
  watchlistCloudAdapter = adapter;
}

function addWatchlistSymbol(symbol: string): void {
  const current = loadWatchlist();
  if (KNOWN_SYMBOLS.has(symbol) && !current.includes(symbol)) saveWatchlist([...current, symbol]);
}

function removeWatchlistSymbol(symbol: string): void {
  saveWatchlist(loadWatchlist().filter((item) => item !== symbol));
}

function toggleWatchlistSymbol(symbol: string): void {
  const current = loadWatchlist();
  if (!KNOWN_SYMBOLS.has(symbol)) return;
  saveWatchlist(
    current.includes(symbol)
      ? current.filter((item) => item !== symbol)
      : [...current, symbol],
  );
}

function hasWatchlistSymbol(symbol: string): boolean {
  return loadWatchlist().includes(symbol);
}

export function useWatchlist(): {
  symbols: readonly string[];
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  toggle: (symbol: string) => void;
  has: (symbol: string) => boolean;
} {
  const symbols = useSyncExternalStore(
    (listener) => {
      watchlistListeners.add(listener);
      return () => watchlistListeners.delete(listener);
    },
    loadWatchlist,
    () => SERVER_DEFAULT_WATCHLIST,
  );
  return {
    symbols,
    add: addWatchlistSymbol,
    remove: removeWatchlistSymbol,
    toggle: toggleWatchlistSymbol,
    has: hasWatchlistSymbol,
  };
}

/* ---------- theme ---------- */

const THEME_KEY = 'pf-theme';
let themeCache: ThemeName | null = null;
const themeListeners = new Set<() => void>();

function loadTheme(): ThemeName {
  if (themeCache) return themeCache;
  themeCache = parseTheme(storageOrNull()?.getItem(THEME_KEY));
  return themeCache;
}

function applyTheme(theme: ThemeName): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

function saveTheme(theme: ThemeName): void {
  themeCache = theme;
  applyTheme(theme);
  try {
    storageOrNull()?.setItem(THEME_KEY, theme);
  } catch {
    // Keep the in-memory theme when storage is unavailable.
  }
  for (const listener of themeListeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const storage = storageOrNull();
    if (event.storageArea && storage && event.storageArea !== storage) return;
    if (event.key === WATCHLIST_KEY) {
      watchlistCache = decodeWatchlist(event.newValue);
      notifyWatchlist();
    }
    if (event.key === THEME_KEY) {
      themeCache = parseTheme(event.newValue);
      applyTheme(themeCache);
      for (const listener of themeListeners) listener();
    }
  });
}

export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const theme = useSyncExternalStore<ThemeName>(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    loadTheme,
    () => 'light',
  );
  useEffect(() => applyTheme(theme), [theme]);
  return {
    theme,
    toggle: () => saveTheme(theme === 'light' ? 'dark' : 'light'),
  };
}
