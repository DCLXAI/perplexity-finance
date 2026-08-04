import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import { evaluateRule, nextState, shouldNotify } from './evaluate.js';
import type { MonitorLatchState, MonitorObservation, MonitorRuleInput } from './evaluate.js';
import { buildMonitorObservation } from './observations.js';
import {
  appendMonitorBreach,
  claimDueMonitorRules,
  enqueueMonitorDigestDeliveries,
  openMonitorDigest,
  recordMonitorEvaluation,
} from './store.js';
import type { MonitorRuleRow } from './store.js';

/**
 * Reserved headroom before the caller's deadline. A group is only started when there is at
 * least this much time left — building one more observation plus recording its rules should
 * comfortably fit, without risking a mid-group cutoff that would leave partial writes.
 */
const PORTFOLIO_BUDGET_MS = 4_000;

export interface PortfolioRuleGroup {
  readonly userId: string;
  readonly portfolioId: string;
  readonly rules: readonly MonitorRuleRow[];
}

/**
 * `claim_due_monitor_rules` returns rows in no particular order (its `ORDER BY` decides which
 * rules are claimed, not the order they come back in). Grouping by portfolio here — rather than
 * relying on adjacency — is what lets every rule in a portfolio share one observation.
 */
export function groupRulesByPortfolio(rows: readonly MonitorRuleRow[]): readonly PortfolioRuleGroup[] {
  const byPortfolio = new Map<string, MonitorRuleRow[]>();
  for (const row of rows) {
    const existing = byPortfolio.get(row.portfolio_id);
    if (existing) existing.push(row);
    else byPortfolio.set(row.portfolio_id, [row]);
  }
  return Object.freeze([...byPortfolio.entries()].map(([portfolioId, rules]) =>
    Object.freeze({ portfolioId, userId: rules[0].user_id, rules: Object.freeze(rules) })));
}

/**
 * A decided outcome (breached/clear) consumes the rule's own interval. A deferral or error has
 * not actually observed anything, so it is retried on the very next run instead of sitting out
 * a full interval — otherwise a transient provider fault could blind a weekly rule for a week.
 */
export function nextEvaluationAt(outcome: string, intervalHours: number, nowMs: number): string {
  if (outcome === 'deferred' || outcome === 'error') return new Date(nowMs).toISOString();
  return new Date(nowMs + intervalHours * 3_600_000).toISOString();
}

export interface MonitorRunResult {
  readonly claimed: number;
  readonly evaluated: number;
  readonly breached: number;
  readonly deferred: number;
  readonly errored: number;
  readonly digests: number;
  readonly portfolios: number;
  readonly budgetExhausted: boolean;
}

/**
 * TASK 7 TODO: replace this with the real `buildDigestPayload` from `./digest.js` once it
 * exists. This placeholder only carries the digest id so `enqueueMonitorDigestDeliveries` has
 * a payload to enqueue; it is intentionally the very last thing `monitorRules` does, so wiring
 * in the real payload assembly means swapping this one call.
 */
function placeholderDigestPayload(digestId: string): Record<string, unknown> {
  return Object.freeze({ digestId });
}

interface RuleEvaluationCounters {
  evaluated: number;
  breached: number;
  deferred: number;
  errored: number;
}

async function recordError(
  rule: MonitorRuleRow,
  message: string,
  counters: RuleEvaluationCounters,
): Promise<void> {
  counters.errored += 1;
  counters.evaluated += 1;
  await recordMonitorEvaluation({
    ruleId: rule.id,
    outcome: 'error',
    state: rule.state,
    observation: {},
    error: message,
    nextEvaluationAt: nextEvaluationAt('error', rule.min_interval_hours, Date.now()),
  });
}

async function evaluateGroup(
  group: PortfolioRuleGroup,
  observation: MonitorObservation,
  digestByUser: Map<string, string>,
  counters: RuleEvaluationCounters,
): Promise<void> {
  for (const rule of group.rules) {
    try {
      const input: MonitorRuleInput = {
        id: rule.id,
        kind: rule.kind,
        spec: rule.spec as unknown as MonitorRuleInput['spec'],
        state: rule.state,
        ruleVersion: rule.rule_version,
      };
      const result = evaluateRule(input, observation);
      const notify = shouldNotify(rule.state, result.outcome);
      const newState: MonitorLatchState = nextState(rule.state, result.outcome);

      if (result.outcome === 'breached') counters.breached += 1;
      if (result.outcome === 'deferred') counters.deferred += 1;
      counters.evaluated += 1;

      if (notify) {
        let digestId = digestByUser.get(group.userId);
        if (!digestId) {
          const digest = await openMonitorDigest(group.userId);
          digestId = digest.id;
          digestByUser.set(group.userId, digestId);
        }
        await appendMonitorBreach({
          ruleId: rule.id,
          digestId,
          userId: group.userId,
          portfolioId: group.portfolioId,
          ruleVersion: rule.rule_version,
          kind: rule.kind,
          spec: rule.spec,
          observedValue: result.observedValue ?? null,
          thresholdValue: result.threshold ?? null,
          observedAt: observation.asOfISO,
          inputQuality: observation.valuationQuality,
          sourceSnapshotId: null,
        });
      }

      await recordMonitorEvaluation({
        ruleId: rule.id,
        outcome: result.outcome,
        state: newState,
        observation: Object.freeze({
          asOfISO: observation.asOfISO,
          outcome: result.outcome,
          observedValue: result.observedValue ?? null,
          threshold: result.threshold ?? null,
          reason: result.reason ?? null,
        }),
        error: null,
        nextEvaluationAt: nextEvaluationAt(result.outcome, rule.min_interval_hours, Date.now()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('monitor.rule_failed', { ruleId: rule.id, portfolioId: group.portfolioId, message });
      await recordError(rule, message, counters);
    }
  }
}

/**
 * Claims due monitor rules, groups them by portfolio so each portfolio's shared observation is
 * loaded exactly once, evaluates every rule against it, and opens/enqueues at most one digest
 * per user for the run. Runs deadline-aware: once the remaining budget can no longer safely
 * cover another portfolio, it stops claiming further groups and leaves their rules'
 * `next_evaluation_at` untouched so the next run picks them up.
 */
export async function monitorRules(requestId: string, deadlineMs: number): Promise<MonitorRunResult> {
  const config = loadConfig();
  const rows = await claimDueMonitorRules(config.monitorRuleLimit);
  const groups = groupRulesByPortfolio(rows);

  const counters: RuleEvaluationCounters = { evaluated: 0, breached: 0, deferred: 0, errored: 0 };
  const digestByUser = new Map<string, string>();
  let portfolios = 0;
  let budgetExhausted = false;

  for (const group of groups) {
    if (Date.now() >= deadlineMs - PORTFOLIO_BUDGET_MS) {
      budgetExhausted = true;
      break;
    }
    portfolios += 1;

    let observation: MonitorObservation;
    try {
      observation = await buildMonitorObservation(group.userId, group.portfolioId, `${requestId}:${group.portfolioId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('monitor.observation_failed', { requestId, portfolioId: group.portfolioId, message });
      for (const rule of group.rules) {
        await recordError(rule, message, counters);
      }
      continue;
    }

    await evaluateGroup(group, observation, digestByUser, counters);
  }

  for (const digestId of digestByUser.values()) {
    await enqueueMonitorDigestDeliveries(digestId, placeholderDigestPayload(digestId));
  }

  return Object.freeze({
    claimed: rows.length,
    evaluated: counters.evaluated,
    breached: counters.breached,
    deferred: counters.deferred,
    errored: counters.errored,
    digests: digestByUser.size,
    portfolios,
    budgetExhausted,
  });
}
