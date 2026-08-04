import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogLevel } from '../config.js';

interface LogContext {
  readonly requestId: string;
  readonly route: string;
}

const context = new AsyncLocalStorage<LogContext>();
const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|service[-_]?role|private[-_]?key|p256dh|vapid|endpoint|email|auth)/i;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const MAX_STRING = 1_000;
const MAX_ARRAY = 30;
const MAX_KEYS = 60;
let threshold: LogLevel = 'info';

function safeString(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
}

export function redactForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: safeString(value.message),
      ...(process.env.NODE_ENV === 'development' && value.stack ? { stack: safeString(value.stack) } : {}),
    };
  }
  if (depth >= 6) return '[max-depth]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redactForLog(entry, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_KEYS)) {
    output[key] = SECRET_KEY.test(key) ? '[redacted]' : redactForLog(entry, depth + 1, seen);
  }
  return output;
}

function write(level: LogLevel, event: string, data?: unknown): void {
  if (rank[level] < rank[threshold]) return;
  const base = {
    timestamp: new Date().toISOString(),
    level,
    event: safeString(event),
    ...context.getStore(),
  };
  const payload = data === undefined ? base : { ...base, data: redactForLog(data) };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  configure(level: LogLevel): void { threshold = level; },
  debug(event: string, data?: unknown): void { write('debug', event, data); },
  info(event: string, data?: unknown): void { write('info', event, data); },
  warn(event: string, data?: unknown): void { write('warn', event, data); },
  error(event: string, data?: unknown): void { write('error', event, data); },
};

export function runWithLogContext<T>(value: LogContext, fn: () => T): T {
  return context.run(value, fn);
}

export function requestIdFromHeader(value?: string): string {
  const clean = value?.trim();
  return clean && REQUEST_ID.test(clean) ? clean : globalThis.crypto.randomUUID();
}
