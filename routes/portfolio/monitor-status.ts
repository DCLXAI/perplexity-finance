import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { clientIp, json, withFunction } from '../../server/http/function.js';
import { listMonitorBreaches, listMonitorRules, type MonitorBreachRow } from '../../server/monitors/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { MonitorBreach, MonitorRuleStatus, MonitorStatusResponse } from '../../src/shared/api.js';

function toMonitorBreach(row: MonitorBreachRow): MonitorBreach {
  return Object.freeze({
    id: row.id,
    ruleId: row.rule_id,
    digestId: row.digest_id,
    ruleVersion: row.rule_version,
    kind: row.kind,
    spec: row.spec,
    observedValue: row.observed_value,
    thresholdValue: row.threshold_value,
    observedAt: row.observed_at,
    inputQuality: row.input_quality,
    createdAt: row.created_at,
  });
}

export default withFunction('portfolio.monitor-status', ['GET'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-monitor-status', `${user.id}:${clientIp(request)}`, 120, 60);

  const portfolioId = z.string().uuid().parse(new URL(request.url).searchParams.get('portfolioId'));
  const rules = await listMonitorRules(user.id, portfolioId);
  const statuses: MonitorRuleStatus[] = await Promise.all(rules.map(async (rule) => Object.freeze({
    ruleId: rule.id,
    kind: rule.kind,
    symbol: rule.symbol,
    state: rule.state,
    lastOutcome: rule.last_outcome,
    lastEvaluatedAt: rule.last_evaluated_at,
    lastObservation: rule.last_observation,
    nextEvaluationAt: rule.next_evaluation_at,
    recentBreaches: (await listMonitorBreaches(user.id, rule.id, 20)).map(toMonitorBreach),
  })));

  const response: MonitorStatusResponse = Object.freeze({
    requestId,
    statuses: Object.freeze(statuses),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
