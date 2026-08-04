import { supabaseConfigured } from '../auth/supabase.js';
import { capabilities } from '../capabilities.js';
import {
  latestProviderHealthSnapshots,
  listOpenIncidents,
  opsBacklog,
  persistentMarketSloEvidence,
  readSystemHeartbeats,
  type PersistentSloEvidence,
  type SystemHeartbeatEvidence,
} from '../cloud/store.js';
import { configDiagnostics, loadConfig, type AppConfig } from '../config.js';
import { marketProviderStatuses } from '../market/service.js';
import { logger } from '../observability/logger.js';
import {
  providerRegistrySloInput,
  type ProviderRegistrySloInput,
} from '../observability/provider-registry.js';
import { recentIncidents } from './incidents.js';
import type {
  OperationalEvidenceSource,
  OpsBacklogSummary,
  OpsSummaryResponse,
  ProviderName,
  ProviderStatus,
  ReadinessCheck,
  ReadinessResponse,
  SloSummary,
} from '../../src/shared/api.js';

const MARKET_PROVIDERS = ['alpaca', 'finnhub', 'coinbase'] as const satisfies readonly ProviderName[];
const HEARTBEAT_NAMES = ['market-capture', 'alert-evaluator'] as const;
const EMPTY_BACKLOG: OpsBacklogSummary = Object.freeze({
  armedAlerts: 0,
  pendingDeliveries: 0,
  retryDeliveries: 0,
  failedDeliveries: 0,
  unresolvedIncidents: 0,
  observations24h: 0,
});

function percentile95(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export function calculateMarketSlo(
  input: ProviderRegistrySloInput = providerRegistrySloInput(MARKET_PROVIDERS),
  config: AppConfig = loadConfig(),
  evidenceSource: OperationalEvidenceSource = 'runtime',
  sampledAt = new Date().toISOString(),
): SloSummary {
  const target = config.releaseMinAvailabilityPct / 100;
  const freshnessTargetSeconds = Math.max(config.quoteMaxAgeStockSeconds, config.quoteMaxAgeCryptoSeconds);
  const availability = input.attempts ? input.successes / input.attempts : 0;
  const p95LatencyMs = percentile95(input.latencies);
  const freshnessPasses = input.freshnessSeconds.filter((value) => value <= freshnessTargetSeconds).length;
  const freshnessPassRate = input.freshnessSeconds.length
    ? freshnessPasses / input.freshnessSeconds.length
    : 0;
  const allowedFailures = input.attempts * Math.max(0, 1 - target);
  const actualFailures = input.attempts - input.successes;
  const errorBudgetRemaining = input.attempts === 0
    ? 1
    : allowedFailures <= 0
      ? actualFailures === 0 ? 1 : -1
      : Math.max(-1, Math.min(1, (allowedFailures - actualFailures) / allowedFailures));

  let status: SloSummary['status'] = 'no-data';
  if (input.attempts > 0) {
    const availabilityBreached = availability < target;
    const latencyBreached = p95LatencyMs > config.releaseMaxP95LatencyMs;
    const freshnessBreached = input.freshnessSeconds.length > 0 && freshnessPassRate < target;
    if (availabilityBreached || latencyBreached || freshnessBreached) status = 'breached';
    else if (
      availability < Math.min(1, target + 0.005)
      || p95LatencyMs > config.releaseMaxP95LatencyMs * 0.8
      || (input.freshnessSeconds.length > 0 && freshnessPassRate < Math.min(1, target + 0.005))
    ) status = 'at-risk';
    else status = 'healthy';
  }

  return Object.freeze({
    windowMinutes: 60,
    availabilityTarget: target,
    freshnessTargetSeconds,
    attempts: input.attempts,
    successes: input.successes,
    availability,
    p95LatencyMs,
    freshnessPassRate,
    errorBudgetRemaining,
    status,
    evidenceSource,
    sampledAt,
  });
}

function evidenceTimestamp(provider: ProviderStatus): number {
  return Math.max(
    new Date(provider.sampledAt ?? 0).getTime() || 0,
    new Date(provider.lastSuccessAt ?? 0).getTime() || 0,
    new Date(provider.lastFailureAt ?? 0).getTime() || 0,
    new Date(provider.checkedAt).getTime() || 0,
  );
}

/**
 * Prefer current-instance evidence when it has actually sampled the provider;
 * otherwise use the newest cross-instance snapshot. Never resurrect a provider
 * that the current deployment has disabled.
 */
export function mergeProviderStatuses(
  runtime: readonly ProviderStatus[],
  persistent: readonly ProviderStatus[],
): readonly ProviderStatus[] {
  const persistentByName = new Map(persistent.map((provider) => [provider.provider, provider]));
  return Object.freeze(runtime.map((current) => {
    if (!current.configured) return current;
    const stored = persistentByName.get(current.provider);
    if (!stored?.configured) return current;
    const runtimeSampled = (current.attempts ?? 0) > 0;
    const persistentNewer = evidenceTimestamp(stored) > evidenceTimestamp(current);
    if (runtimeSampled && !persistentNewer) return current;
    return Object.freeze({
      ...stored,
      configured: true,
      message: `지속 원장 · ${stored.message}`,
      evidenceSource: 'persistent-ledger' as const,
    });
  }));
}

export async function resolveMarketProviderStatuses(): Promise<readonly ProviderStatus[]> {
  const runtime = marketProviderStatuses();
  if (!supabaseConfigured()) return runtime;
  try {
    return mergeProviderStatuses(runtime, await latestProviderHealthSnapshots(60));
  } catch (error) {
    logger.warn('ops.provider_evidence_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return runtime;
  }
}

function providerCheck(provider: ProviderStatus, required: boolean): ReadinessCheck {
  const status: ReadinessCheck['status'] = !provider.configured
    ? required ? 'fail' : 'warn'
    : provider.status === 'down'
      ? required ? 'fail' : 'warn'
      : provider.status === 'degraded'
        ? required ? 'fail' : 'warn'
        : 'pass';
  const evidence = provider.evidenceSource === 'persistent-ledger' ? '지속 원장' : '현재 인스턴스';
  return Object.freeze({
    name: `market-provider:${provider.provider}`,
    required,
    status,
    message: `${provider.message} · 근거 ${evidence}`,
    ...(provider.latencyMs === undefined ? {} : { latencyMs: provider.latencyMs }),
    ...(provider.lastFailureAt ? { lastFailureAt: provider.lastFailureAt } : {}),
    ...(provider.consecutiveFailures === undefined ? {} : { failures: provider.consecutiveFailures }),
    ...(provider.circuitState ? { circuitState: provider.circuitState } : {}),
    ...(provider.nextRetryAt ? { nextRetryAt: provider.nextRetryAt } : {}),
  });
}

function heartbeatCheck(
  name: string,
  heartbeats: readonly SystemHeartbeatEvidence[],
  maxAgeMs: number,
  required: boolean,
): ReadinessCheck {
  const heartbeat = heartbeats.find((entry) => entry.name === name);
  const ageMs = heartbeat ? Date.now() - new Date(heartbeat.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const fresh = Boolean(heartbeat) && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  return Object.freeze({
    name: `heartbeat:${name}`,
    required,
    status: fresh ? 'pass' : required ? 'fail' : 'warn',
    message: fresh
      ? `${Math.max(0, Math.round(ageMs / 1000))}초 전에 완료됨`
      : heartbeat
        ? `${Math.max(0, Math.round(ageMs / 1000))}초 동안 heartbeat가 없습니다.`
        : 'heartbeat 기록이 없습니다.',
    ...(heartbeat ? { lastFailureAt: heartbeat.lastSeenAt } : {}),
  });
}

interface ReadinessEvidence {
  readonly providers?: readonly ProviderStatus[];
  readonly heartbeats?: readonly SystemHeartbeatEvidence[];
}

export function buildReadiness(
  requestId: string,
  evidence: ReadinessEvidence = {},
): ReadinessResponse {
  const config = loadConfig();
  const caps = capabilities();
  const diagnostics = configDiagnostics(config);
  const providers = evidence.providers ?? marketProviderStatuses();
  const configuredProviders = providers.filter((provider) => provider.configured);
  const checks: ReadinessCheck[] = [];

  checks.push(Object.freeze({
    name: 'configuration',
    required: true,
    status: diagnostics.errors.length ? 'fail' : diagnostics.warnings.length ? 'warn' : 'pass',
    message: diagnostics.errors[0] ?? diagnostics.warnings[0] ?? '런타임 설정이 유효합니다.',
  }));

  const successfulProvider = configuredProviders.some((provider) => provider.status === 'up');
  const unprobed = configuredProviders.length > 0
    && configuredProviders.every((provider) => (provider.attempts ?? 0) === 0);
  checks.push(Object.freeze({
    name: 'market-data',
    required: config.requireLiveData,
    status: successfulProvider ? 'pass' : config.requireLiveData ? 'fail' : 'warn',
    message: !configuredProviders.length
      ? config.allowMockFallback
        ? '외부 시장 데이터 공급자가 없어 명시적 로컬 폴백 모드입니다.'
        : '시장 데이터 공급자와 폴백이 모두 비활성입니다.'
      : unprobed
        ? `${configuredProviders.length}개 공급자가 설정됐지만 실제 성공 probe가 아직 없습니다.`
        : successfulProvider
          ? '최근 검증 가능한 공급자 호출이 성공했습니다.'
          : '공급자는 설정됐지만 최근 검증 가능한 성공이 없습니다.',
  }));

  for (const provider of providers) {
    checks.push(providerCheck(
      provider,
      config.requireLiveData && configuredProviders.length === 1 && provider.configured,
    ));
  }

  for (const [name, enabled, required, message] of [
    ['cloud-account', caps.cloudAccount, config.requireCloud, 'Supabase 계정·영속 저장소'],
    ['durable-alerts', caps.durableAlerts, config.requireDurableAlerts, '지속 가격 알림 Cron'],
    ['ai-tools', caps.aiTools, config.requireAi, 'OpenAI 금융 도구'],
    ['persistent-ledger', caps.persistentMarketLedger, config.requireCloud, '시장 관측 원장'],
  ] as const) {
    checks.push(Object.freeze({
      name,
      required,
      status: enabled ? 'pass' : required ? 'fail' : 'warn',
      message: enabled ? `${message} 준비됨` : `${message} 미설정`,
    }));
  }

  if (caps.persistentMarketLedger) {
    const heartbeats = evidence.heartbeats ?? [];
    checks.push(heartbeatCheck('market-capture', heartbeats, 12 * 60_000, config.requireLiveData));
    checks.push(heartbeatCheck('alert-evaluator', heartbeats, 3 * 60_000, config.requireDurableAlerts));
  }

  const errors = [
    ...diagnostics.errors,
    ...checks.filter((check) => check.required && check.status === 'fail')
      .map((check) => `${check.name}: ${check.message}`),
  ];
  const warnings = [
    ...diagnostics.warnings,
    ...checks.filter((check) => check.status === 'warn')
      .map((check) => `${check.name}: ${check.message}`),
  ];
  const ready = errors.length === 0;
  return Object.freeze({
    requestId,
    ready,
    status: ready ? warnings.length ? 'degraded' : 'ready' : 'not-ready',
    version: config.version,
    releaseChannel: config.releaseChannel,
    generatedAt: new Date().toISOString(),
    checks: Object.freeze(checks),
    errors: Object.freeze([...new Set(errors)]),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

export async function buildReadinessWithPersistence(requestId: string): Promise<ReadinessResponse> {
  if (!supabaseConfigured()) return buildReadiness(requestId);
  const [providers, heartbeats] = await Promise.allSettled([
    latestProviderHealthSnapshots(60),
    readSystemHeartbeats(HEARTBEAT_NAMES),
  ]);
  const merged = providers.status === 'fulfilled'
    ? mergeProviderStatuses(marketProviderStatuses(), providers.value)
    : marketProviderStatuses();
  if (providers.status === 'rejected') {
    logger.warn('readiness.provider_evidence_failed', { message: String(providers.reason) });
  }
  if (heartbeats.status === 'rejected') {
    logger.warn('readiness.heartbeat_failed', { message: String(heartbeats.reason) });
  }
  return buildReadiness(requestId, {
    providers: merged,
    heartbeats: heartbeats.status === 'fulfilled' ? heartbeats.value : Object.freeze([]),
  });
}

export function evaluateReleaseGate(
  readiness: ReadinessResponse,
  slo: SloSummary,
  config: AppConfig = loadConfig(),
): Readonly<{ status: 'pass' | 'warn' | 'fail'; reasons: readonly string[] }> {
  const reasons: string[] = [];
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  if (!readiness.ready) {
    status = 'fail';
    reasons.push(...readiness.errors);
  }
  if (slo.status === 'breached') {
    status = 'fail';
    reasons.push('최근 60분 시장 데이터 SLO가 배포 기준을 위반했습니다.');
  } else if (slo.status === 'at-risk') {
    if (status !== 'fail') status = 'warn';
    reasons.push('최근 60분 시장 데이터 SLO가 위험 구간입니다.');
  } else if (slo.status === 'no-data') {
    const strict = config.deploymentStage === 'production' && config.requireLiveData;
    status = strict ? 'fail' : status === 'pass' ? 'warn' : status;
    reasons.push('최근 공급자 호출 표본이 없어 SLO를 증명할 수 없습니다.');
  }
  if (readiness.warnings.length && status === 'pass') {
    status = 'warn';
    reasons.push('필수는 아니지만 미설정 또는 저하된 기능이 있습니다.');
  }
  if (!reasons.length) reasons.push('필수 readiness와 시장 데이터 SLO가 배포 기준을 통과했습니다.');
  return Object.freeze({ status, reasons: Object.freeze([...new Set(reasons)]) });
}

function persistentInput(value: PersistentSloEvidence): ProviderRegistrySloInput {
  return Object.freeze({
    attempts: value.attempts,
    successes: value.successes,
    latencies: value.latencies,
    freshnessSeconds: value.freshnessSeconds,
  });
}

export async function buildOpsSummary(requestId: string): Promise<OpsSummaryResponse> {
  let providers = marketProviderStatuses();
  let heartbeats: readonly SystemHeartbeatEvidence[] = Object.freeze([]);
  let sloInput = providerRegistrySloInput(MARKET_PROVIDERS);
  let sloSource: OperationalEvidenceSource = 'runtime';
  let sloSampledAt = new Date().toISOString();
  let backlog = EMPTY_BACKLOG;
  let incidents = recentIncidents(50);

  if (supabaseConfigured()) {
    const [providerResult, heartbeatResult, sloResult, backlogResult, incidentResult] = await Promise.allSettled([
      latestProviderHealthSnapshots(60),
      readSystemHeartbeats(HEARTBEAT_NAMES),
      persistentMarketSloEvidence(60),
      opsBacklog(),
      listOpenIncidents(50),
    ]);
    if (providerResult.status === 'fulfilled') providers = mergeProviderStatuses(providers, providerResult.value);
    else logger.warn('ops.provider_evidence_failed', { message: String(providerResult.reason) });
    if (heartbeatResult.status === 'fulfilled') heartbeats = heartbeatResult.value;
    else logger.warn('ops.heartbeat_failed', { message: String(heartbeatResult.reason) });
    if (sloResult.status === 'fulfilled' && sloResult.value.attempts > 0) {
      sloInput = persistentInput(sloResult.value);
      sloSource = 'persistent-ledger';
      sloSampledAt = sloResult.value.sampledAt;
    } else if (sloResult.status === 'rejected') {
      logger.warn('ops.slo_evidence_failed', { message: String(sloResult.reason) });
    }
    if (backlogResult.status === 'fulfilled') backlog = backlogResult.value;
    else logger.warn('ops.backlog_failed', { message: String(backlogResult.reason) });
    if (incidentResult.status === 'fulfilled') {
      const byId = new Map([...incidentResult.value, ...incidents].map((incident) => [incident.id, incident]));
      incidents = Object.freeze([...byId.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 50));
    } else logger.warn('ops.incidents_failed', { message: String(incidentResult.reason) });
  }

  const readiness = buildReadiness(requestId, { providers, heartbeats });
  const marketSlo = calculateMarketSlo(sloInput, loadConfig(), sloSource, sloSampledAt);
  const gate = evaluateReleaseGate(readiness, marketSlo);
  const reasons = [...gate.reasons];
  let gateStatus = gate.status;
  if (incidents.some((incident) => incident.severity === 'critical' && !incident.resolvedAt)) {
    gateStatus = 'fail';
    reasons.push('해결되지 않은 critical 데이터 품질 incident가 있습니다.');
  }
  if (backlog.failedDeliveries > 0 && gateStatus === 'pass') gateStatus = 'warn';
  if (backlog.failedDeliveries > 0) reasons.push(`실패한 알림 전달 ${backlog.failedDeliveries}건이 있습니다.`);

  return Object.freeze({
    requestId,
    generatedAt: new Date().toISOString(),
    version: readiness.version,
    providers,
    marketSlo,
    backlog,
    incidents,
    releaseGate: Object.freeze({ status: gateStatus, reasons: Object.freeze([...new Set(reasons)]) }),
  });
}
