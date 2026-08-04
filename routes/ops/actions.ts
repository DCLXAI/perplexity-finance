import { z } from 'zod';
import { requireOpsAccess, supabaseConfigured } from '../../server/auth/supabase.js';
import {
  claimOpsAction,
  completeOpsAction,
  insertOpsAudit,
  insertReleaseGateRun,
  pruneOperationalData,
  releaseOpsAction,
  retryFailedDeliveries,
  type OpsActionClaim,
} from '../../server/cloud/store.js';
import { loadConfig } from '../../server/config.js';
import { ApiError, json, readJson, withFunction } from '../../server/http/function.js';
import { getMarketQuotes } from '../../server/market/service.js';
import { logger } from '../../server/observability/logger.js';
import { buildOpsSummary, buildReadinessWithPersistence } from '../../server/ops/summary.js';
import { resetCircuit } from '../../server/resilience/circuit-breaker.js';
import type { OpsAction, OpsActionResponse, ProviderName } from '../../src/shared/api.js';

const inputSchema = z.object({
  action: z.enum(['probe-providers', 'reset-circuit', 'retry-failed-deliveries', 'prune-operational-data', 'run-release-gate']),
  provider: z.enum(['alpaca', 'finnhub', 'coinbase']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict();

interface LocalActionLease {
  readonly state: 'processing' | 'completed';
  readonly ownerRequestId: string;
  readonly expiresAt: number;
  readonly response?: OpsActionResponse;
}
const localIdempotency = new Map<string, LocalActionLease>();
const ACTION_LEASE_MS = 120_000;
const ACTION_RETENTION_MS = 15 * 60_000;

function idempotencyKey(request: Request): string {
  const value = request.headers.get('idempotency-key')?.trim();
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', '8~128자의 유효한 Idempotency-Key 헤더가 필요합니다.');
  }
  return value;
}
function cacheKey(key: string, action: OpsAction): string {
  return `${action}:${key}`;
}
function pruneLocal(now = Date.now()): void {
  for (const [key, value] of localIdempotency) {
    if (value.expiresAt <= now) localIdempotency.delete(key);
  }
  while (localIdempotency.size >= 250) {
    const first = localIdempotency.keys().next().value as string | undefined;
    if (!first) break;
    localIdempotency.delete(first);
  }
}
function claimLocal(key: string, action: OpsAction, requestId: string): OpsActionClaim {
  const now = Date.now();
  pruneLocal(now);
  const id = cacheKey(key, action);
  const existing = localIdempotency.get(id);
  if (existing?.state === 'completed' && existing.response) {
    return Object.freeze({ state: 'completed', response: existing.response });
  }
  if (existing?.state === 'processing') {
    return Object.freeze({ state: 'in-progress', retryAt: new Date(existing.expiresAt).toISOString() });
  }
  localIdempotency.set(id, Object.freeze({
    state: 'processing',
    ownerRequestId: requestId,
    expiresAt: now + ACTION_LEASE_MS,
  }));
  return Object.freeze({ state: 'claimed' });
}
function completeLocal(key: string, action: OpsAction, requestId: string, response: OpsActionResponse): boolean {
  const id = cacheKey(key, action);
  const existing = localIdempotency.get(id);
  if (!existing || existing.state !== 'processing' || existing.ownerRequestId !== requestId) return false;
  localIdempotency.set(id, Object.freeze({
    state: 'completed',
    ownerRequestId: requestId,
    expiresAt: Date.now() + ACTION_RETENTION_MS,
    response,
  }));
  return true;
}
function releaseLocal(key: string, action: OpsAction, requestId: string): boolean {
  const id = cacheKey(key, action);
  const existing = localIdempotency.get(id);
  if (!existing || existing.state !== 'processing' || existing.ownerRequestId !== requestId) return false;
  return localIdempotency.delete(id);
}
function retryAfter(retryAt?: string): string {
  const delay = retryAt ? Math.ceil((new Date(retryAt).getTime() - Date.now()) / 1000) : 5;
  return String(Math.max(1, Number.isFinite(delay) ? delay : 5));
}
async function claimAction(key: string, action: OpsAction, requestId: string): Promise<OpsActionClaim> {
  if (!supabaseConfigured()) return claimLocal(key, action, requestId);
  try {
    return await claimOpsAction(key, action, requestId, ACTION_LEASE_MS / 1000);
  } catch (error) {
    logger.error('ops.idempotency_claim_failed', error);
    throw new ApiError(503, 'OPS_LEDGER_UNAVAILABLE', '운영 중복 방지 원장을 사용할 수 없습니다. 변경 작업을 실행하지 않았습니다.');
  }
}
async function completeAction(
  key: string,
  action: OpsAction,
  requestId: string,
  response: OpsActionResponse,
): Promise<boolean> {
  return supabaseConfigured()
    ? completeOpsAction(key, action, requestId, response)
    : completeLocal(key, action, requestId, response);
}
async function releaseAction(key: string, action: OpsAction, requestId: string): Promise<boolean> {
  return supabaseConfigured()
    ? releaseOpsAction(key, action, requestId)
    : releaseLocal(key, action, requestId);
}

async function executeAction(
  action: OpsAction,
  provider: ProviderName | undefined,
  limit: number | undefined,
  requestId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const config = loadConfig();
  switch (action) {
    case 'probe-providers': {
      const response = await getMarketQuotes(['AMD', 'BTCUSD'], requestId);
      return Object.freeze({
        mode: response.mode,
        quotes: response.quotes.map((quote) => ({
          symbol: quote.symbol,
          price: quote.price,
          source: quote.provenance.source,
          quality: quote.provenance.quality,
          decision: quote.provenance.verification?.decision ?? 'unknown',
        })),
        providers: response.providers,
        warnings: response.warnings,
      });
    }
    case 'reset-circuit': {
      if (!provider || !['alpaca', 'finnhub', 'coinbase'].includes(provider)) {
        throw new ApiError(400, 'PROVIDER_REQUIRED', '회로를 초기화할 시장 데이터 공급자가 필요합니다.');
      }
      return Object.freeze({ provider, circuit: resetCircuit(provider) });
    }
    case 'retry-failed-deliveries': {
      if (!supabaseConfigured()) throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', '영속 전달 큐가 설정되지 않았습니다.');
      return Object.freeze({ retried: await retryFailedDeliveries(limit ?? config.deliveryBatchSize) });
    }
    case 'prune-operational-data': {
      if (!supabaseConfigured()) throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', '운영 원장이 설정되지 않았습니다.');
      return Object.freeze({ pruned: await pruneOperationalData(config.retentionDays), retentionDays: config.retentionDays });
    }
    case 'run-release-gate': {
      const readiness = await buildReadinessWithPersistence(requestId);
      const summary = await buildOpsSummary(requestId);
      const slo = summary.marketSlo;
      const gate = summary.releaseGate;
      if (supabaseConfigured()) {
        await insertReleaseGateRun({
          requestId,
          status: gate.status,
          reasons: gate.reasons,
          readiness: readiness as unknown as Readonly<Record<string, unknown>>,
          slo: slo as unknown as Readonly<Record<string, unknown>>,
        });
      }
      return Object.freeze({ gate, readiness, slo });
    }
  }
}

export default withFunction('ops.actions', ['POST'], async (request, requestId) => {
  const actor = await requireOpsAccess(request);
  const key = idempotencyKey(request);
  const input = inputSchema.parse(await readJson<unknown>(request));
  const action = input.action as OpsAction;
  const claim = await claimAction(key, action, requestId);

  if (claim.state === 'completed') return json(claim.response, {}, requestId);
  if (claim.state === 'in-progress') {
    throw new ApiError(409, 'OPERATION_IN_PROGRESS', '같은 idempotency key의 작업이 이미 실행 중입니다.', {
      'Retry-After': retryAfter(claim.retryAt),
    });
  }

  const actorId = actor?.id ?? 'machine:ops-secret';
  let sideEffectCompleted = false;
  try {
    const result = await executeAction(action, input.provider, input.limit, requestId);
    sideEffectCompleted = true;
    const response: OpsActionResponse = Object.freeze({
      requestId,
      action,
      accepted: true,
      result: Object.freeze({ ...result }),
      generatedAt: new Date().toISOString(),
    });

    const completed = await completeAction(key, action, requestId, response);
    if (!completed) {
      logger.error('ops.idempotency_complete_failed', {
        action,
        idempotencyKeyPrefix: key.slice(0, 4),
      });
      throw new ApiError(
        503,
        'OPS_LEDGER_COMMIT_FAILED',
        '작업은 실행됐지만 중복 방지 원장 확정에 실패했습니다. 같은 키를 즉시 재사용하지 마세요.',
      );
    }

    if (supabaseConfigured()) {
      await insertOpsAudit({
        actorId,
        action,
        requestId,
        idempotencyKey: key,
        accepted: true,
        result: response.result,
      }).catch((error: unknown) => logger.warn('ops.audit_write_failed', {
        message: error instanceof Error ? error.message : String(error),
      }));
    }
    return json(response, {}, requestId);
  } catch (error) {
    // Before an action returns, releasing the lease permits a safe retry. Once
    // the side effect completed, retain the lease on commit uncertainty to
    // prevent an immediate duplicate execution; action implementations remain
    // idempotent because no distributed system can promise exactly-once I/O.
    if (!sideEffectCompleted) {
      await releaseAction(key, action, requestId).catch((releaseError: unknown) => {
        logger.error('ops.idempotency_release_failed', releaseError);
      });
    }
    if (supabaseConfigured()) {
      await insertOpsAudit({
        actorId,
        action,
        requestId,
        idempotencyKey: key,
        accepted: false,
        result: Object.freeze({ error: error instanceof ApiError ? error.code : 'OPERATION_FAILED' }),
      }).catch((auditError: unknown) => logger.warn('ops.audit_write_failed', {
        message: auditError instanceof Error ? auditError.message : String(auditError),
      }));
    }
    throw error;
  }
});
