import { Redis } from '@upstash/redis';
import { loadConfig } from './config.js';
import { logger } from './observability/logger.js';
import { metrics } from './observability/metrics.js';

interface Entry<T = unknown> {
  readonly storedAt: number;
  readonly freshUntil: number;
  readonly staleUntil: number;
  readonly value: T;
}

interface RedisEntry<T> {
  readonly version: 1;
  readonly storedAt: number;
  readonly freshUntil: number;
  readonly staleUntil: number;
  readonly value: T;
}

export type CacheSource = 'memory' | 'upstash' | 'miss' | 'stale-memory' | 'stale-upstash';
export interface CachedValue<T> {
  readonly value: T;
  readonly cache: CacheSource;
  readonly stale: boolean;
  readonly ageMs: number;
}

export interface CacheLoadOptions {
  /** Force the loader to run while retaining an existing value only as stale-if-error evidence. */
  readonly forceRefresh?: boolean;
}

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const config = loadConfig();
  redis = config.upstashUrl && config.upstashToken
    ? new Redis({ url: config.upstashUrl, token: config.upstashToken })
    : null;
  return redis;
}

function validEntry<T>(value: unknown): value is RedisEntry<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RedisEntry<T>>;
  return candidate.version === 1
    && typeof candidate.storedAt === 'number'
    && typeof candidate.freshUntil === 'number'
    && typeof candidate.staleUntil === 'number'
    && 'value' in candidate;
}

function remember<T>(key: string, entry: Entry<T>): void {
  const now = Date.now();
  for (const [candidate, value] of memory) {
    if (value.staleUntil <= now) memory.delete(candidate);
  }
  while (memory.size >= 500) {
    const oldest = memory.keys().next().value as string | undefined;
    if (!oldest) break;
    memory.delete(oldest);
  }
  memory.delete(key);
  memory.set(key, entry);
}

function result<T>(entry: Entry<T>, source: CacheSource, now = Date.now()): CachedValue<T> {
  return Object.freeze({
    value: entry.value,
    cache: source,
    stale: now > entry.freshUntil,
    ageMs: Math.max(0, now - entry.storedAt),
  });
}

async function readRemote<T>(key: string): Promise<Entry<T> | undefined> {
  const remote = getRedis();
  if (!remote) return undefined;
  try {
    const value = await remote.get<RedisEntry<T>>(key);
    if (!validEntry<T>(value) || value.staleUntil <= Date.now()) return undefined;
    const entry: Entry<T> = Object.freeze({
      storedAt: value.storedAt,
      freshUntil: value.freshUntil,
      staleUntil: value.staleUntil,
      value: value.value,
    });
    remember(key, entry);
    return entry;
  } catch (error) {
    metrics.increment('cache_backend_errors_total', { operation: 'get' });
    logger.warn('cache.upstash_get_failed', { message: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

async function writeRemote<T>(key: string, entry: Entry<T>): Promise<void> {
  const remote = getRedis();
  if (!remote) return;
  try {
    const ttl = Math.max(1, Math.ceil((entry.staleUntil - Date.now()) / 1000));
    const payload: RedisEntry<T> = { version: 1, ...entry };
    await remote.set(key, payload, { ex: ttl });
  } catch (error) {
    metrics.increment('cache_backend_errors_total', { operation: 'set' });
    logger.warn('cache.upstash_set_failed', { message: error instanceof Error ? error.message : String(error) });
  }
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  staleSeconds = loadConfig().staleIfErrorSeconds,
  options: CacheLoadOptions = {},
): Promise<CachedValue<T>> {
  const now = Date.now();
  const forceRefresh = options.forceRefresh === true;
  let candidate = memory.get(key) as Entry<T> | undefined;
  if (!forceRefresh && candidate && candidate.freshUntil > now) return result(candidate, 'memory', now);
  if (candidate && candidate.staleUntil <= now) {
    memory.delete(key);
    candidate = undefined;
  }

  const remote = await readRemote<T>(key);
  if (!forceRefresh && remote && remote.freshUntil > Date.now()) return result(remote, 'upstash');
  if (!candidate || (remote && remote.storedAt > candidate.storedAt)) candidate = remote;

  const existing = forceRefresh ? undefined : inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      const value = await existing;
      const entry = memory.get(key) as Entry<T> | undefined;
      if (entry) return result(entry, 'memory');
      return Object.freeze({ value, cache: 'miss', stale: false, ageMs: 0 });
    } catch (error) {
      if (candidate && candidate.staleUntil > Date.now()) {
        const source = remote === candidate ? 'stale-upstash' : 'stale-memory';
        metrics.increment('cache_stale_served_total', { source });
        return result(candidate, source);
      }
      throw error;
    }
  }

  const pending = loader();
  inflight.set(key, pending);
  try {
    const value = await pending;
    const storedAt = Date.now();
    const entry: Entry<T> = Object.freeze({
      storedAt,
      freshUntil: storedAt + ttlSeconds * 1000,
      staleUntil: storedAt + (ttlSeconds + staleSeconds) * 1000,
      value,
    });
    remember(key, entry);
    await writeRemote(key, entry);
    return result(entry, 'miss');
  } catch (error) {
    if (candidate && candidate.staleUntil > Date.now()) {
      const source = remote === candidate ? 'stale-upstash' : 'stale-memory';
      metrics.increment('cache_stale_served_total', { source });
      logger.warn('cache.stale_if_error', {
        key,
        source,
        ageMs: Date.now() - candidate.storedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      return result(candidate, source);
    }
    throw error;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const now = Date.now();
  const local = memory.get(key) as Entry<T> | undefined;
  if (local && local.staleUntil > now) return local.value;
  if (local) memory.delete(key);
  const remote = await readRemote<T>(key);
  return remote && remote.staleUntil > Date.now() ? remote.value : undefined;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const storedAt = Date.now();
  const entry: Entry<T> = Object.freeze({
    storedAt,
    freshUntil: storedAt + ttlSeconds * 1000,
    staleUntil: storedAt + ttlSeconds * 1000,
    value,
  });
  remember(key, entry);
  await writeRemote(key, entry);
}

export function resetCacheForTests(): void {
  memory.clear();
  inflight.clear();
  redis = undefined;
}
