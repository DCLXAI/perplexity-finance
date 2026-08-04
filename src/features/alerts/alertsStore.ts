/* ============================================================
   Hybrid price-alert store.
   - Local alerts keep the P1 browser-only threshold watcher.
   - Remote alerts are authoritative server records evaluated by Cron.
   - The two modes never evaluate the same alert twice.
   ============================================================ */
import { useSyncExternalStore } from 'react';
import { engine } from '@/data/engine';
import { fmtQuoteValue } from '@/data/format';
import { parseJson } from '@/data/persistence';
import type { MarketBatch, Quote } from '@/data/types';
import type {
  AlertCondition,
  AlertDeliverySummary,
  DataProvenance,
  ServerPriceAlert,
} from '@/shared/api';

export interface PriceAlert {
  readonly id: string;
  readonly symbol: string;
  readonly condition: AlertCondition;
  readonly target: number;
  readonly createdISO: string;
  /** unix ms when triggered; undefined = pending */
  readonly triggeredAt?: number;
  /** false = counted in the header badge */
  readonly seen: boolean;
  readonly remoteManaged?: boolean;
  readonly state?: 'armed' | 'triggered' | 'disabled';
  readonly baseline?: number;
  readonly lastObservedPrice?: number;
  readonly triggeredPrice?: number;
  readonly triggeredProvenance?: DataProvenance;
  readonly emailEnabled?: boolean;
  readonly pushEnabled?: boolean;
  readonly deliveries?: readonly AlertDeliverySummary[];
}

export interface Toast {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface AlertCreateOptions {
  readonly remote?: boolean;
  readonly emailEnabled?: boolean;
  readonly pushEnabled?: boolean;
}

export interface AlertsCloudAdapter {
  create(input: {
    symbol: string;
    condition: AlertCondition;
    target: number;
    emailEnabled: boolean;
    pushEnabled: boolean;
  }): Promise<ServerPriceAlert>;
  remove(id: string): Promise<void>;
  markSeen(): Promise<void>;
}

const KEY = 'pf-alerts-v1';
const EMPTY_ALERTS: readonly PriceAlert[] = Object.freeze([]);
const EMPTY_TOASTS: readonly Toast[] = Object.freeze([]);
const MAX_ALERTS = 200;
const KNOWN_SYMBOLS = new Set(engine.getAll().map((quote) => quote.symbol));

let alerts: readonly PriceAlert[] = loadAlerts();
let toasts: readonly Toast[] = EMPTY_TOASTS;
const alertListeners = new Set<() => void>();
const toastListeners = new Set<() => void>();
const lastPrices = new Map<string, number>();
let watcherStarted = false;
let nextId = 1;
let cloudAdapter: AlertsCloudAdapter | null = null;

function storageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validISO(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function sanitizeAlerts(value: unknown): readonly PriceAlert[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const seenIds = new Set<string>();
  const sanitized: PriceAlert[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : '';
    const condition = item.condition;
    const target = item.target;
    if (
      !id ||
      seenIds.has(id) ||
      !KNOWN_SYMBOLS.has(symbol) ||
      (condition !== 'above' && condition !== 'below') ||
      typeof target !== 'number' ||
      !Number.isFinite(target) ||
      target <= 0 ||
      !validISO(item.createdISO) ||
      typeof item.seen !== 'boolean'
    ) {
      continue;
    }

    const triggeredAt = optionalFinite(item.triggeredAt);
    const remoteManaged = item.remoteManaged === true;
    const state = item.state === 'armed' || item.state === 'triggered' || item.state === 'disabled'
      ? item.state
      : undefined;
    const baseline = optionalFinite(item.baseline);
    const lastObservedPrice = optionalFinite(item.lastObservedPrice);
    const triggeredPrice = optionalFinite(item.triggeredPrice);
    seenIds.add(id);
    sanitized.push(
      Object.freeze({
        id,
        symbol,
        condition,
        target,
        createdISO: item.createdISO,
        ...(triggeredAt !== undefined ? { triggeredAt } : {}),
        seen: item.seen,
        ...(remoteManaged ? { remoteManaged: true } : {}),
        ...(state ? { state } : {}),
        ...(baseline !== undefined ? { baseline } : {}),
        ...(lastObservedPrice !== undefined ? { lastObservedPrice } : {}),
        ...(triggeredPrice !== undefined ? { triggeredPrice } : {}),
        ...(typeof item.emailEnabled === 'boolean' ? { emailEnabled: item.emailEnabled } : {}),
        ...(typeof item.pushEnabled === 'boolean' ? { pushEnabled: item.pushEnabled } : {}),
      }),
    );
    if (sanitized.length >= MAX_ALERTS) break;
  }

  return Object.freeze(sanitized);
}

function loadAlerts(): readonly PriceAlert[] {
  return sanitizeAlerts(parseJson(storageOrNull()?.getItem(KEY) ?? null));
}

function persist(): void {
  try {
    storageOrNull()?.setItem(KEY, JSON.stringify(alerts));
  } catch {
    // In-memory alerts continue to work if persistence is unavailable.
  }
}

function emitAlerts(shouldPersist = true): void {
  if (shouldPersist) persist();
  for (const listener of alertListeners) listener();
}

function emitToasts(): void {
  for (const listener of toastListeners) listener();
}

function pushToast(title: string, body: string): void {
  const toast: Toast = Object.freeze({
    id: `t${Date.now()}-${nextId++}`,
    title,
    body,
  });
  toasts = Object.freeze([...toasts, toast]);
  emitToasts();
  globalThis.setTimeout(() => {
    toasts = Object.freeze(toasts.filter((item) => item.id !== toast.id));
    emitToasts();
  }, 7000);
}

export function didCrossThreshold(
  condition: AlertCondition,
  previous: number,
  current: number,
  target: number,
): boolean {
  if (![previous, current, target].every(Number.isFinite)) return false;
  return condition === 'above'
    ? previous < target && current >= target
    : previous > target && current <= target;
}

function baselineFor(alert: PriceAlert): number | undefined {
  return lastPrices.get(alert.id) ?? alert.baseline ?? engine.getQuote(alert.symbol)?.price;
}

function refreshBaselines(): void {
  const localAlerts = alerts.filter((alert) => !alert.remoteManaged);
  const validIds = new Set(localAlerts.map((alert) => alert.id));
  for (const id of lastPrices.keys()) {
    if (!validIds.has(id)) lastPrices.delete(id);
  }
  for (const alert of localAlerts) {
    if (!lastPrices.has(alert.id)) {
      const price = engine.getQuote(alert.symbol)?.price;
      if (price !== undefined) lastPrices.set(alert.id, price);
    }
  }
}

function toastFor(alert: PriceAlert, quote: Quote, remote = false): void {
  const name = quote.nameKo ?? quote.name;
  pushToast(
    remote ? '🔔 서버 가격 알림' : '🔔 가격 알림 교차',
    `${name}(${quote.symbol}) — ${fmtQuoteValue(quote, alert.target)} ${
      alert.condition === 'above' ? '이상' : '이하'
    }로 교차했습니다. 현재 ${fmtQuoteValue(quote, alert.triggeredPrice ?? quote.price)}`,
  );
}

/** Start the one global engine watcher on first store use. */
function ensureWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  refreshBaselines();

  engine.subscribeAll((batch: MarketBatch) => {
    const quoteBySymbol = new Map(batch.quotes.map((quote) => [quote.symbol, quote]));
    let changed = false;
    const nextAlerts = alerts.map((alert) => {
      if (alert.remoteManaged || alert.triggeredAt) return alert;
      const quote = quoteBySymbol.get(alert.symbol);
      if (!quote) return alert;

      const previous = baselineFor(alert) ?? quote.price;
      lastPrices.set(alert.id, quote.price);
      if (!didCrossThreshold(alert.condition, previous, quote.price, alert.target)) return alert;

      changed = true;
      const triggered = Object.freeze({
        ...alert,
        triggeredAt: Date.now(),
        triggeredPrice: quote.price,
        state: 'triggered' as const,
        seen: false,
      });
      toastFor(triggered, quote);
      return triggered;
    });

    if (changed) {
      alerts = Object.freeze(nextAlerts);
      emitAlerts();
    }
  });
}

function fromServerAlert(value: ServerPriceAlert): PriceAlert {
  return Object.freeze({
    id: value.id,
    symbol: value.symbol,
    condition: value.condition,
    target: value.target,
    createdISO: value.createdAt,
    ...(value.triggeredAt ? { triggeredAt: Date.parse(value.triggeredAt) } : {}),
    seen: value.seen,
    remoteManaged: true,
    state: value.state,
    baseline: value.baseline,
    ...(value.lastObservedPrice !== undefined ? { lastObservedPrice: value.lastObservedPrice } : {}),
    ...(value.triggeredPrice !== undefined ? { triggeredPrice: value.triggeredPrice } : {}),
    ...(value.triggeredProvenance ? { triggeredProvenance: value.triggeredProvenance } : {}),
    emailEnabled: value.emailEnabled,
    pushEnabled: value.pushEnabled,
    deliveries: value.deliveries,
  });
}

function upsertRemoteAlert(value: ServerPriceAlert): void {
  const created = fromServerAlert(value);
  const local = alerts.filter((alert) => !alert.remoteManaged);
  const remote = alerts
    .filter((alert) => alert.remoteManaged && alert.id !== created.id)
    .slice(0, Math.max(0, MAX_ALERTS - local.length - 1));
  alerts = Object.freeze([...local, created, ...remote]);
  refreshBaselines();
  emitAlerts();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const storage = storageOrNull();
    if ((event.storageArea && storage && event.storageArea !== storage) || event.key !== KEY) return;
    alerts = sanitizeAlerts(parseJson(event.newValue));
    refreshBaselines();
    emitAlerts(false);
  });
}

/* ---------- public API ---------- */

export function setAlertsCloudAdapter(adapter: AlertsCloudAdapter | null): void {
  cloudAdapter = adapter;
}

export function replaceAlertsFromCloud(values: readonly ServerPriceAlert[]): void {
  const previousRemote = new Map(
    alerts.filter((alert) => alert.remoteManaged).map((alert) => [alert.id, alert]),
  );
  const local = alerts.filter((alert) => !alert.remoteManaged);
  const remote = values
    .filter((value) => KNOWN_SYMBOLS.has(value.symbol))
    .slice(0, MAX_ALERTS - local.length)
    .map(fromServerAlert);

  for (const next of remote) {
    const previous = previousRemote.get(next.id);
    if (previous && next.triggeredAt && !previous.triggeredAt) {
      const quote = engine.getQuote(next.symbol);
      if (quote) toastFor(next, quote, true);
    }
  }

  alerts = Object.freeze([...local, ...remote]);
  refreshBaselines();
  emitAlerts();
}

export function clearRemoteAlerts(): void {
  const next = alerts.filter((alert) => !alert.remoteManaged);
  if (next.length === alerts.length) return;
  alerts = Object.freeze(next);
  refreshBaselines();
  emitAlerts();
}

export function addAlert(
  symbol: string,
  condition: AlertCondition,
  target: number,
): string | null {
  const quote = engine.getQuote(symbol);
  if (!quote || !Number.isFinite(target) || target <= 0 || alerts.length >= MAX_ALERTS) return null;
  ensureWatcher();

  const id = `a${Date.now()}-${nextId++}`;
  const alert: PriceAlert = Object.freeze({
    id,
    symbol,
    condition,
    target,
    createdISO: new Date().toISOString(),
    baseline: quote.price,
    state: 'armed',
    seen: true,
  });
  lastPrices.set(id, quote.price);
  alerts = Object.freeze([...alerts, alert]);
  emitAlerts();
  return id;
}

export async function createPriceAlert(
  symbol: string,
  condition: AlertCondition,
  target: number,
  options: AlertCreateOptions = {},
): Promise<string | null> {
  if (options.remote) {
    if (!cloudAdapter) return null;
    const created = await cloudAdapter.create({
      symbol,
      condition,
      target,
      emailEnabled: options.emailEnabled ?? false,
      pushEnabled: options.pushEnabled ?? false,
    });
    upsertRemoteAlert(created);
    return created.id;
  }
  return addAlert(symbol, condition, target);
}

export function removeAlert(id: string): void {
  const current = alerts.find((alert) => alert.id === id);
  const next = alerts.filter((alert) => alert.id !== id);
  if (next.length === alerts.length) return;
  lastPrices.delete(id);
  alerts = Object.freeze(next);
  emitAlerts();
  if (current?.remoteManaged && cloudAdapter) {
    void cloudAdapter.remove(id).catch((error: unknown) => {
      console.warn('[alerts-cloud-delete]', error);
    });
  }
}

export function markAllSeen(): void {
  if (!alerts.some((alert) => !alert.seen)) return;
  const hadRemoteUnseen = alerts.some((alert) => alert.remoteManaged && !alert.seen);
  alerts = Object.freeze(
    alerts.map((alert) => (alert.seen ? alert : Object.freeze({ ...alert, seen: true }))),
  );
  emitAlerts();
  if (hadRemoteUnseen && cloudAdapter) {
    void cloudAdapter.markSeen().catch((error: unknown) => {
      console.warn('[alerts-cloud-seen]', error);
    });
  }
}

export function useAlerts(): readonly PriceAlert[] {
  ensureWatcher();
  return useSyncExternalStore(
    (listener) => {
      alertListeners.add(listener);
      return () => alertListeners.delete(listener);
    },
    () => alerts,
    () => EMPTY_ALERTS,
  );
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toasts,
    () => EMPTY_TOASTS,
  );
}
