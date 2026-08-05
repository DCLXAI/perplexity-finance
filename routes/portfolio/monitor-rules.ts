import { ZodError, z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import {
  ApiError,
  clientIp,
  json,
  readJson,
  requireIdempotencyKey,
  withFunction,
} from '../../server/http/function.js';
import { defaultIntervalHours, parseMonitorRuleSpec } from '../../server/monitors/rules.js';
import {
  deleteMonitorRule,
  listMonitorRules,
  upsertMonitorRule,
  type MonitorRuleRow,
} from '../../server/monitors/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { MonitorRule, MonitorRuleMutationResponse, MonitorRulesResponse } from '../../src/shared/api.js';

const kindSchema = z.enum(['thesis_invalidation', 'risk_threshold', 'stress_scenario']);

const base = {
  portfolioId: z.string().uuid(),
  thesisId: z.string().uuid().nullable().default(null),
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()).nullable().default(null),
  kind: kindSchema,
  spec: z.unknown(),
  enabled: z.boolean().default(true),
  minIntervalHours: z.number().int().min(1).max(8_760).optional(),
};
const createSchema = z.object(base).strict();
const patchSchema = z.object({ ruleId: z.string().uuid(), ...base }).strict();
const deleteSchema = z.object({ ruleId: z.string().uuid() }).strict();

function toMonitorRule(row: MonitorRuleRow): MonitorRule {
  return Object.freeze({
    id: row.id,
    portfolioId: row.portfolio_id,
    thesisId: row.thesis_id,
    symbol: row.symbol,
    kind: row.kind,
    spec: row.spec,
    enabled: row.enabled,
    state: row.state,
    lastOutcome: row.last_outcome,
    lastEvaluatedAt: row.last_evaluated_at,
    lastObservation: row.last_observation,
    lastError: row.last_error,
    latchedAt: row.latched_at,
    minIntervalHours: row.min_interval_hours,
    nextEvaluationAt: row.next_evaluation_at,
    ruleVersion: row.rule_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * The RPCs behind upsert/delete raise plain Postgres exceptions for ownership and
 * not-found cases (see 202608050001_p10_monitor_rules.sql); server/monitors/store.ts wraps
 * those as generic Error, so map the known messages here rather than let them surface as a
 * raw 500.
 */
function mapMonitorStoreError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/portfolio not found/i.test(message)) {
    throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
  }
  if (/monitor rule not found/i.test(message)) {
    throw new ApiError(404, 'MONITOR_RULE_NOT_FOUND', '감시 규칙을 찾을 수 없습니다.');
  }
  if (/spec/i.test(message)) {
    throw new ApiError(400, 'MONITOR_RULE_SPEC_INVALID', '감시 규칙 조건이 올바르지 않습니다.');
  }
  throw error;
}

function parseSpecOrThrow(kind: z.infer<typeof kindSchema>, spec: unknown): Record<string, unknown> {
  try {
    return parseMonitorRuleSpec(kind, spec) as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, 'MONITOR_RULE_SPEC_INVALID', '감시 규칙 조건이 올바르지 않습니다.');
    }
    throw error;
  }
}

export default withFunction('portfolio.monitor-rules', ['GET', 'POST', 'PATCH', 'DELETE'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-monitor-rules', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    requireIdempotencyKey(request);
    const input = createSchema.parse(await readJson<unknown>(request));
    const spec = parseSpecOrThrow(input.kind, input.spec);
    const response: MonitorRuleMutationResponse = Object.freeze({
      requestId,
      rule: toMonitorRule(await upsertMonitorRule({
        userId: user.id,
        portfolioId: input.portfolioId,
        ruleId: null,
        thesisId: input.thesisId,
        symbol: input.symbol,
        kind: input.kind,
        spec,
        enabled: input.enabled,
        minIntervalHours: input.minIntervalHours ?? defaultIntervalHours(input.kind),
      }).catch(mapMonitorStoreError)),
    });
    return json(response, { status: 201 }, requestId);
  }

  if (request.method === 'PATCH') {
    requireIdempotencyKey(request);
    const input = patchSchema.parse(await readJson<unknown>(request));
    const spec = parseSpecOrThrow(input.kind, input.spec);
    const response: MonitorRuleMutationResponse = Object.freeze({
      requestId,
      rule: toMonitorRule(await upsertMonitorRule({
        userId: user.id,
        portfolioId: input.portfolioId,
        ruleId: input.ruleId,
        thesisId: input.thesisId,
        symbol: input.symbol,
        kind: input.kind,
        spec,
        enabled: input.enabled,
        minIntervalHours: input.minIntervalHours ?? defaultIntervalHours(input.kind),
      }).catch(mapMonitorStoreError)),
    });
    return json(response, {}, requestId);
  }

  if (request.method === 'DELETE') {
    const input = deleteSchema.parse(await readJson<unknown>(request));
    await deleteMonitorRule(user.id, input.ruleId);
    return json({ requestId, ok: true }, {}, requestId);
  }

  const portfolioId = z.string().uuid().parse(new URL(request.url).searchParams.get('portfolioId'));
  const response: MonitorRulesResponse = Object.freeze({
    requestId,
    rules: (await listMonitorRules(user.id, portfolioId)).map(toMonitorRule),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
