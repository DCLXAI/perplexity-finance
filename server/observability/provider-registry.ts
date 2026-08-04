import type { DataMode, ProviderName, ProviderStatus } from '../../src/shared/api.js';
import { snapshotCircuit } from '../resilience/circuit-breaker.js';

interface ProviderEvent {
  readonly at: number;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly freshnessSeconds?: number;
}
interface ProviderRuntime {
  configured: boolean;
  label: string;
  mode: DataMode;
  events: ProviderEvent[];
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  lastLatencyMs?: number;
  message?: string;
}

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 500;
const states = new Map<ProviderName, ProviderRuntime>();

function runtime(provider: ProviderName): ProviderRuntime {
  let value = states.get(provider);
  if (!value) {
    value = { configured: false, label: provider, mode: 'fallback', events: [] };
    states.set(provider, value);
  }
  return value;
}
function prune(value: ProviderRuntime, now = Date.now()): void {
  value.events = value.events.filter((event) => now - event.at <= WINDOW_MS).slice(-MAX_EVENTS);
}
export function configureProvider(provider: ProviderName, configured: boolean, label: string, mode: DataMode): void {
  const value = runtime(provider);
  value.configured = configured;
  value.label = label;
  value.mode = configured ? mode : 'fallback';
  if (!configured) value.message = `${label} 미설정`;
}
export function recordProviderSuccess(
  provider: ProviderName,
  latencyMs: number,
  options: { mode?: DataMode; freshnessSeconds?: number; message?: string } = {},
): void {
  const value = runtime(provider);
  const now = Date.now();
  value.events.push({ at: now, success: true, latencyMs, freshnessSeconds: options.freshnessSeconds });
  value.lastSuccessAt = new Date(now).toISOString();
  value.lastLatencyMs = latencyMs;
  value.lastError = undefined;
  value.message = options.message ?? '최근 요청 성공';
  if (options.mode) value.mode = options.mode;
  prune(value, now);
}
export function recordProviderCacheHit(
  provider: ProviderName,
  cache: string,
  options: { mode?: DataMode; freshnessSeconds?: number } = {},
): void {
  const value = runtime(provider);
  const freshness = options.freshnessSeconds !== undefined && Number.isFinite(options.freshnessSeconds)
    ? ` · 데이터 ${Math.round(options.freshnessSeconds)}초 경과`
    : '';
  value.message = `검증된 ${cache} cache 사용 · 공급자 호출 없음${freshness}`;
  if (options.mode) value.mode = options.mode;
  // Cache service is useful response evidence, but it is deliberately not
  // appended to provider events or counted as provider availability.
}

export function recordProviderFailure(provider: ProviderName, error: unknown, latencyMs = 0): void {
  const value = runtime(provider);
  const now = Date.now();
  value.events.push({ at: now, success: false, latencyMs });
  value.lastFailureAt = new Date(now).toISOString();
  value.lastLatencyMs = latencyMs;
  value.lastError = error instanceof Error ? error.message : String(error);
  value.message = value.lastError;
  prune(value, now);
}
function percentile95(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}
export function providerStatus(provider: ProviderName): ProviderStatus {
  const value = runtime(provider);
  prune(value);
  const attempts = value.events.length;
  const successes = value.events.filter((event) => event.success).length;
  const successRate = attempts ? successes / attempts : 0;
  const circuit = snapshotCircuit(provider, value.configured);
  const latest = value.events.at(-1);
  const status: ProviderStatus['status'] = !value.configured
    ? 'disabled'
    : circuit.state === 'open'
      ? 'down'
      : attempts === 0
        ? 'degraded'
        : latest?.success === false || successRate < 0.95
          ? 'degraded'
          : 'up';
  return Object.freeze({
    provider,
    configured: value.configured,
    status,
    mode: value.configured ? value.mode : 'fallback',
    message: value.message ?? (value.configured ? '설정됨 · 아직 실제 공급자 호출을 확인하지 않았습니다.' : `${value.label} 미설정`),
    checkedAt: new Date().toISOString(),
    ...(value.lastSuccessAt ? { lastSuccessAt: value.lastSuccessAt } : {}),
    ...(value.lastFailureAt ? { lastFailureAt: value.lastFailureAt } : {}),
    ...(value.lastLatencyMs === undefined ? {} : { latencyMs: value.lastLatencyMs }),
    p95LatencyMs: percentile95(value.events.map((event) => event.latencyMs)),
    attempts,
    successRate,
    circuitState: circuit.state,
    consecutiveFailures: circuit.failures,
    ...(circuit.retryAt ? { nextRetryAt: circuit.retryAt } : {}),
    evidenceSource: 'runtime',
    sampledAt: new Date().toISOString(),
  });
}
export function providerStatuses(providers?: readonly ProviderName[]): readonly ProviderStatus[] {
  const names = providers ?? [...states.keys()];
  return Object.freeze(names.map(providerStatus));
}
export interface ProviderRegistrySloInput {
  readonly attempts: number;
  readonly successes: number;
  readonly latencies: readonly number[];
  readonly freshnessSeconds: readonly number[];
}
export function providerRegistrySloInput(providers: readonly ProviderName[]): ProviderRegistrySloInput {
  const events = providers.flatMap((provider) => {
    const value = runtime(provider);
    prune(value);
    return value.events;
  });
  return Object.freeze({
    attempts: events.length,
    successes: events.filter((event) => event.success).length,
    latencies: Object.freeze(events.map((event) => event.latencyMs)),
    freshnessSeconds: Object.freeze(events.flatMap((event) => event.freshnessSeconds === undefined ? [] : [event.freshnessSeconds])),
  });
}
export function resetProviderRegistryForTests(): void {
  states.clear();
}
