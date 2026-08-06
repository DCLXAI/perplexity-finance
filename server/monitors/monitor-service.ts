import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import { buildDigestPayload } from './digest.js';
import { evaluateRule, nextState, shouldNotify } from './evaluate.js';
import type { MonitorLatchState, MonitorObservation, MonitorRuleInput } from './evaluate.js';
import { buildMonitorObservation } from './observations.js';
import {
  appendMonitorBreach,
  claimDueMonitorRules,
  enqueueMonitorDigestDeliveries,
  listMonitorBreachesByDigest,
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

interface RuleEvaluationCounters {
  evaluated: number;
  breached: number;
  deferred: number;
  errored: number;
}

/**
 * Records an `error` outcome for a rule that could not be evaluated or persisted normally.
 * Never rethrows: this is itself the failure-recovery path, so a second failure here (e.g. the
 * same transient RPC fault that caused the original failure) must be logged and swallowed
 * rather than escaping to kill the rest of the group or run.
 *
 * `state` defaults to the rule's current state, but callers that already durably appended a
 * breach row before this failure must pass the computed latched state instead — recording the
 * rule back as `armed` would let the very same breach fire, and get appended, a second time on
 * the next run.
 */
async function recordError(
  rule: MonitorRuleRow,
  message: string,
  counters: RuleEvaluationCounters,
  state: MonitorLatchState = rule.state,
): Promise<void> {
  counters.errored += 1;
  counters.evaluated += 1;
  try {
    await recordMonitorEvaluation({
      ruleId: rule.id,
      outcome: 'error',
      state,
      observation: {},
      error: message,
      nextEvaluationAt: nextEvaluationAt('error', rule.min_interval_hours, Date.now()),
    });
  } catch (recordFailure) {
    const failureMessage = recordFailure instanceof Error ? recordFailure.message : String(recordFailure);
    logger.warn('monitor.record_error_failed', { ruleId: rule.id, message: failureMessage });
  }
}

async function evaluateGroup(
  group: PortfolioRuleGroup,
  observation: MonitorObservation,
  digestByUser: Map<string, string>,
  counters: RuleEvaluationCounters,
): Promise<void> {
  for (const rule of group.rules) {
    // Tracks whether `appendMonitorBreach` already succeeded this iteration. If a later step
    // (recordMonitorEvaluation) throws, the catch below must still record the rule as latched —
    // not as its old `armed` state — since the breach row is already durable and un-latching
    // would let the identical breach fire, and get appended, again on the next run.
    let breachAppended = false;
    let newState: MonitorLatchState = rule.state;
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
      newState = nextState(rule.state, result.outcome);

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
        breachAppended = true;
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

      // Only counted once the outcome is durably recorded — a failure below lands in the catch
      // and is counted exactly once, by `recordError`, instead.
      if (result.outcome === 'breached') counters.breached += 1;
      if (result.outcome === 'deferred') counters.deferred += 1;
      counters.evaluated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('monitor.rule_failed', { ruleId: rule.id, portfolioId: group.portfolioId, message });
      await recordError(rule, message, counters, breachAppended ? newState : rule.state);
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

    // Defense in depth: `evaluateGroup` already catches every per-rule failure internally, so
    // it should not throw. If it somehow did, one bad group must still not end the run — the
    // remaining groups' rules keep their existing `next_evaluation_at` and are retried next run.
    try {
      await evaluateGroup(group, observation, digestByUser, counters);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('monitor.group_failed', { requestId, portfolioId: group.portfolioId, message });
    }
  }

  for (const [userId, digestId] of digestByUser) {
    try {
      // The payload is built from the DURABLE breach rows attached to this digest, not from
      // whatever this run happened to append. `open_monitor_digest` reuses any still-`open`
      // digest for the user, so a digest reached here may already carry breaches from an
      // earlier run whose enqueue failed (the catch below leaves the digest `open` on purpose).
      // Building from an in-run map would ship a payload containing only this run's breaches:
      // the earlier breach would never be delivered, and its rule is already `latched`, so it
      // could never notify again.
      const breaches = await listMonitorBreachesByDigest(digestId);
      // A digest id can be reserved (`openMonitorDigest`) before its first breach is durably
      // appended. If that append then fails, and nothing else breaches for this user in the same
      // run, the digest ends up with zero breaches — enqueueing that would send a real user a
      // notification saying "0 conditions were met", which is worse than no notification at all.
      // Leave the digest row `open`: `open_monitor_digest` reuses it on the next run that has a
      // real breach for this user, so nothing is orphaned.
      if (breaches.length === 0) {
        logger.warn('monitor.digest_empty_skipped', { userId, digestId });
        continue;
      }
      const enqueued = await enqueueMonitorDigestDeliveries(
        digestId,
        buildDigestPayload(breaches, config.publicOrigin ?? ''),
      );
      // 0 means the digest was not fanned out: it was no longer `open` (already dispatched by a
      // concurrent run, or its delivery rows already exist). Nothing will be sent for this
      // digest, so it must not pass silently.
      if (enqueued === 0) {
        logger.warn('monitor.digest_not_fanned_out', { userId, digestId, breaches: breaches.length });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('monitor.digest_enqueue_failed', { userId, digestId, message });
    }
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
