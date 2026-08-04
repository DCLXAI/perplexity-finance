import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { loadConfig } from './config.js';
import { ApiError } from './http/function.js';
import { logger } from './observability/logger.js';
import { metrics } from './observability/metrics.js';

interface LocalBucket { count: number; reset: number }
const local = new Map<string, LocalBucket>();
const remotes = new Map<string, Ratelimit>();
const MAX_LOCAL_BUCKETS = 10_000;
let lastSweep = 0;

function retryError(resetMs: number): ApiError {
  const seconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  return new ApiError(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.', {
    'Retry-After': String(seconds),
  });
}

function sweep(now: number): void {
  if (now - lastSweep < 30_000 && local.size < MAX_LOCAL_BUCKETS) return;
  lastSweep = now;
  for (const [key, value] of local) {
    if (value.reset <= now) local.delete(key);
  }
  if (local.size <= MAX_LOCAL_BUCKETS) return;
  const overflow = local.size - MAX_LOCAL_BUCKETS;
  for (const key of [...local.keys()].slice(0, overflow)) local.delete(key);
}

function localLimit(scope: string, id: string, limit: number, windowSeconds: number): void {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${id}`;
  const bucket = local.get(key);
  if (!bucket || bucket.reset <= now) {
    local.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw retryError(bucket.reset);
}

export async function enforceRateLimit(
  scope: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const config = loadConfig();
  if (config.upstashUrl && config.upstashToken) {
    try {
      const key = `${scope}:${limit}:${windowSeconds}`;
      let limiter = remotes.get(key);
      if (!limiter) {
        limiter = new Ratelimit({
          redis: new Redis({ url: config.upstashUrl, token: config.upstashToken }),
          limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
          prefix: `pf:${scope}`,
          analytics: false,
        });
        remotes.set(key, limiter);
      }
      const result = await limiter.limit(id);
      if (!result.success) throw retryError(result.reset);
      return;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      metrics.increment('rate_limit_backend_failures_total', { scope });
      logger.warn('rate_limit.remote_failed', {
        scope,
        message: error instanceof Error ? error.message : String(error),
      });
      // Keep the API available, but retain an instance-local safety net.
    }
  }
  localLimit(scope, id, limit, windowSeconds);
}

export function resetRateLimitForTests(): void {
  local.clear();
  remotes.clear();
  lastSweep = 0;
}
