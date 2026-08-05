import { ZodError, z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import {
  ApiError,
  clientIp,
  json,
  readJson,
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

/**
 * NOT IDEMPOTENT. Unlike contributions and rebalances (`findContributionIdempotency` /
 * `findRebalanceIdempotency` in `server/portfolio/*.ts`), there is no replay store for monitor
 * rules, and `monitor_rules` has no unique constraint that would dedupe a retried insert
 * either. POST and PATCH below therefore do NOT require an `Idempotency-Key` header: requiring
 * one we do not honour would be worse than not requiring one at all, because the README's
 * Idempotency-Key convention teaches clients that retrying with the same key is safe -- and a
 * conforming client retries precisely on a network timeout, i.e. exactly when the write may
 * already have committed. A retried POST after a timeout can therefore create a duplicate
 * rule, which means duplicate evaluations every cycle, duplicate breach rows, and the same
 * alert twice in every digest email -- permanently, until the user manually deletes it. If
 * duplicate-rule creation on retry becomes a real problem, the fix is a replay store or a
 * DB-level dedupe constraint, not re-adding an unenforced header.
 */

const kindSchema = z.enum(['thesis_invalidation', 'risk_threshold', 'stress_scenario']);

const base = {
  portfolioId: z.string().uuid(),
  thesisId: z.string().uuid().nullable().default(null),
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.:-]+$/)
    .transform((value) => value.toUpperCase()).nullable().default(null),
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
 * `upsert_monitor_rule` raises plain Postgres exceptions for "portfolio not found for user"
 * and for spec-validation failures from `validate_monitor_rule_spec` (see
 * 202608050001_p10_monitor_rules.sql) -- the latter is a defense-in-depth backstop distinct
 * from `parseMonitorRuleSpec`'s Zod check above, and it can reject a spec Zod accepted (e.g.
 * `thesis threshold must be positive`, which Zod's `percentSchema` (`min(0)`) allows at 0 but
 * the RPC requires to be positive). A table check constraint violation (`violates check
 * constraint`, e.g. the thesis/symbol pairing check) can also surface directly from the
 * INSERT/UPDATE. `server/monitors/store.ts` wraps all of these as a generic `Error`, so map
 * the known messages here rather than let them surface as a raw 500.
 *
 * `delete_monitor_rule`, by contrast, is a plain `DELETE ... WHERE id = p_rule_id AND user_id
 * = p_user_id` -- it never raises for a missing or foreign-owned row, it just deletes zero
 * rows -- so this mapper is intentionally not attached to the DELETE call below.
 */
function mapMonitorStoreError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/portfolio not found/i.test(message)) {
    throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
  }
  if (/monitor rule not found/i.test(message)) {
    throw new ApiError(404, 'MONITOR_RULE_NOT_FOUND', '감시 규칙을 찾을 수 없습니다.');
  }
  if (
    /thesis_invalidation spec requires|unknown thesis condition|thesis threshold must be positive|unknown risk metric|unknown comparison|stress_scenario requires|maxProjectedLossPct must be non-negative|unknown monitor rule kind|violates check constraint/i
      .test(message)
  ) {
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

/**
 * Cross-checks the top-level `symbol` column against `spec` rather than trusting the client to
 * keep them in sync. The table's check constraint requires `(kind = 'thesis_invalidation') =
 * (symbol is not null)`, but never checks the column *against* `spec.symbol` -- and the two are
 * used inconsistently downstream: the evaluator matches holdings on `spec.symbol`, while the
 * digest labels a breach from the `symbol` column. A rule with column `AAPL` and
 * `spec.symbol: 'TSLA'` would evaluate TSLA and email "AAPL" if this were not enforced. For
 * `thesis_invalidation`, the column is derived FROM the validated spec (the client may omit
 * the top-level symbol -- it naturally already lives in `spec` -- but if it supplies one, it
 * must agree). For the other two kinds, the column must be null.
 */
function resolveRuleSymbol(
  kind: z.infer<typeof kindSchema>,
  suppliedSymbol: string | null,
  spec: Record<string, unknown>,
): string | null {
  if (kind === 'thesis_invalidation') {
    const specSymbol = typeof spec.symbol === 'string' ? spec.symbol : null;
    if (!specSymbol) {
      // parseMonitorRuleSpec already guarantees every thesis_invalidation branch carries a
      // symbol; this is defensive only and should be unreachable.
      throw new ApiError(400, 'MONITOR_RULE_SPEC_INVALID', '감시 규칙 조건이 올바르지 않습니다.');
    }
    if (suppliedSymbol !== null && suppliedSymbol !== specSymbol) {
      throw new ApiError(400, 'MONITOR_RULE_SYMBOL_MISMATCH', '심볼이 조건의 심볼과 일치하지 않습니다.');
    }
    return specSymbol;
  }
  if (suppliedSymbol !== null) {
    throw new ApiError(400, 'MONITOR_RULE_SYMBOL_NOT_ALLOWED', '이 감시 규칙 종류에는 심볼을 지정할 수 없습니다.');
  }
  return null;
}

export default withFunction('portfolio.monitor-rules', ['GET', 'POST', 'PATCH', 'DELETE'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-monitor-rules', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    const input = createSchema.parse(await readJson<unknown>(request));
    const spec = parseSpecOrThrow(input.kind, input.spec);
    const symbol = resolveRuleSymbol(input.kind, input.symbol, spec);
    const response: MonitorRuleMutationResponse = Object.freeze({
      requestId,
      rule: toMonitorRule(await upsertMonitorRule({
        userId: user.id,
        portfolioId: input.portfolioId,
        ruleId: null,
        thesisId: input.thesisId,
        symbol,
        kind: input.kind,
        spec,
        enabled: input.enabled,
        minIntervalHours: input.minIntervalHours ?? defaultIntervalHours(input.kind),
      }).catch(mapMonitorStoreError)),
    });
    return json(response, { status: 201 }, requestId);
  }

  if (request.method === 'PATCH') {
    const input = patchSchema.parse(await readJson<unknown>(request));
    const spec = parseSpecOrThrow(input.kind, input.spec);
    const symbol = resolveRuleSymbol(input.kind, input.symbol, spec);
    const response: MonitorRuleMutationResponse = Object.freeze({
      requestId,
      rule: toMonitorRule(await upsertMonitorRule({
        userId: user.id,
        portfolioId: input.portfolioId,
        ruleId: input.ruleId,
        thesisId: input.thesisId,
        symbol,
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
    rules: Object.freeze((await listMonitorRules(user.id, portfolioId)).map(toMonitorRule)),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
