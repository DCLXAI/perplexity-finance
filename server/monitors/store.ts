import { getSupabaseAdmin } from '../auth/supabase.js';

export type MonitorRuleKind = 'thesis_invalidation' | 'risk_threshold' | 'stress_scenario';
export type MonitorRuleState = 'armed' | 'latched';
export type MonitorRuleOutcome = 'breached' | 'clear' | 'deferred' | 'error';
export type MonitorDigestDeliveryChannel = 'email' | 'push';
export type MonitorDigestDeliveryStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'sent'
  | 'failed'
  | 'disabled';

export interface MonitorRuleRow {
  readonly id: string;
  readonly user_id: string;
  readonly portfolio_id: string;
  readonly thesis_id: string | null;
  readonly symbol: string | null;
  readonly kind: MonitorRuleKind;
  readonly spec: Record<string, unknown>;
  readonly enabled: boolean;
  readonly state: MonitorRuleState;
  readonly last_outcome: MonitorRuleOutcome | null;
  readonly last_evaluated_at: string | null;
  readonly last_observation: Record<string, unknown>;
  readonly last_error: string | null;
  readonly latched_at: string | null;
  readonly min_interval_hours: number;
  readonly next_evaluation_at: string;
  readonly evaluation_lease_until: string | null;
  readonly rule_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MonitorBreachRow {
  readonly id: string;
  readonly rule_id: string;
  readonly digest_id: string | null;
  readonly user_id: string;
  readonly portfolio_id: string;
  readonly rule_version: number;
  readonly kind: MonitorRuleKind;
  readonly spec: Record<string, unknown>;
  readonly observed_value: number | string | null;
  readonly threshold_value: number | string | null;
  readonly observed_at: string;
  readonly input_quality: string;
  readonly source_snapshot_id: number | string | null;
  readonly created_at: string;
}

export interface MonitorDigestDeliveryRow {
  readonly id: string;
  readonly digest_id: string;
  readonly user_id: string;
  readonly channel: MonitorDigestDeliveryChannel;
  readonly status: MonitorDigestDeliveryStatus;
  readonly attempts: number;
  readonly payload: Record<string, unknown>;
  readonly next_attempt_at: string | null;
  readonly sent_at: string | null;
  readonly last_error: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface UpsertMonitorRuleInput {
  readonly userId: string;
  readonly portfolioId: string;
  readonly ruleId: string | null;
  readonly thesisId: string | null;
  readonly symbol: string | null;
  readonly kind: MonitorRuleKind;
  readonly spec: Record<string, unknown>;
  readonly enabled: boolean;
  readonly minIntervalHours: number;
}

export interface AppendBreachInput {
  readonly ruleId: string;
  readonly digestId: string;
  readonly userId: string;
  readonly portfolioId: string;
  readonly ruleVersion: number;
  readonly kind: MonitorRuleKind;
  readonly spec: Record<string, unknown>;
  readonly observedValue: number | null;
  readonly thresholdValue: number | null;
  readonly observedAt: string;
  readonly inputQuality: string;
  readonly sourceSnapshotId: string | number | null;
}

export interface RecordMonitorEvaluationInput {
  readonly ruleId: string;
  readonly outcome: MonitorRuleOutcome;
  readonly state: MonitorRuleState;
  readonly observation: Record<string, unknown>;
  readonly error: string | null;
  readonly nextEvaluationAt: string;
}

function ensure(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function claimDueMonitorRules(limit: number): Promise<readonly MonitorRuleRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_due_monitor_rules', { p_limit: limit });
  ensure(error, 'monitor_rules.claim_due');
  return Object.freeze([...(data ?? [])] as MonitorRuleRow[]);
}

export async function recordMonitorEvaluation(input: RecordMonitorEvaluationInput): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('record_monitor_evaluation', {
    p_rule_id: input.ruleId,
    p_outcome: input.outcome,
    p_state: input.state,
    p_observation: input.observation,
    p_error: input.error,
    p_next_evaluation_at: input.nextEvaluationAt,
  });
  ensure(error, 'monitor_rules.record_evaluation');
}

export async function openMonitorDigest(userId: string): Promise<{ readonly id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc('open_monitor_digest', { p_user_id: userId });
  ensure(error, 'monitor_digests.open');
  const row = data as { id: string };
  return Object.freeze({ id: row.id });
}

export async function appendMonitorBreach(input: AppendBreachInput): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc('append_monitor_breach', {
    p_rule_id: input.ruleId,
    p_digest_id: input.digestId,
    p_user_id: input.userId,
    p_portfolio_id: input.portfolioId,
    p_rule_version: input.ruleVersion,
    p_kind: input.kind,
    p_spec: input.spec,
    p_observed: input.observedValue,
    p_threshold: input.thresholdValue,
    p_observed_at: input.observedAt,
    p_input_quality: input.inputQuality,
    p_snapshot_id: input.sourceSnapshotId,
  });
  ensure(error, 'monitor_breaches.append');
  return data as string;
}

export async function enqueueMonitorDigestDeliveries(digestId: string, payload: unknown): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc('enqueue_monitor_digest_deliveries', {
    p_digest_id: digestId,
    p_payload: payload,
  });
  ensure(error, 'monitor_digest_deliveries.enqueue');
  const count = Number(data ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export async function claimDueMonitorDigestDeliveries(limit: number): Promise<readonly MonitorDigestDeliveryRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_due_monitor_digest_deliveries', { p_limit: limit });
  ensure(error, 'monitor_digest_deliveries.claim_due');
  return Object.freeze([...(data ?? [])] as MonitorDigestDeliveryRow[]);
}

export async function markMonitorDigestDeliverySent(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('mark_monitor_digest_delivery_sent', { p_id: id });
  ensure(error, 'monitor_digest_deliveries.sent');
}

export async function markMonitorDigestDeliveryFailure(
  id: string,
  attempts: number,
  error: string,
  nextAttemptAt: string | null,
): Promise<void> {
  const { error: rpcError } = await getSupabaseAdmin().rpc('mark_monitor_digest_delivery_failure', {
    p_id: id,
    p_attempts: attempts,
    p_error: error,
    p_next_attempt_at: nextAttemptAt,
  });
  ensure(rpcError, 'monitor_digest_deliveries.failure');
}

export async function markMonitorDigestDeliveryDisabled(id: string, reason: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('mark_monitor_digest_delivery_disabled', {
    p_id: id,
    p_reason: reason,
  });
  ensure(error, 'monitor_digest_deliveries.disabled');
}

export async function listMonitorRules(
  userId: string,
  portfolioId: string,
): Promise<readonly MonitorRuleRow[]> {
  const { data, error } = await getSupabaseAdmin().from('monitor_rules').select('*')
    .eq('user_id', userId).eq('portfolio_id', portfolioId)
    .order('created_at', { ascending: true });
  ensure(error, 'monitor_rules.list');
  return Object.freeze([...(data ?? [])] as MonitorRuleRow[]);
}

export async function upsertMonitorRule(input: UpsertMonitorRuleInput): Promise<MonitorRuleRow> {
  const { data, error } = await getSupabaseAdmin().rpc('upsert_monitor_rule', {
    p_user_id: input.userId,
    p_portfolio_id: input.portfolioId,
    p_rule_id: input.ruleId,
    p_thesis_id: input.thesisId,
    p_symbol: input.symbol,
    p_kind: input.kind,
    p_spec: input.spec,
    p_enabled: input.enabled,
    p_min_interval_hours: input.minIntervalHours,
  });
  ensure(error, 'monitor_rules.upsert');
  return Object.freeze(data as MonitorRuleRow);
}

export async function deleteMonitorRule(userId: string, ruleId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('delete_monitor_rule', {
    p_user_id: userId,
    p_rule_id: ruleId,
  });
  ensure(error, 'monitor_rules.delete');
}

export async function listMonitorBreaches(
  userId: string,
  ruleId: string,
  limit: number,
): Promise<readonly MonitorBreachRow[]> {
  const { data, error } = await getSupabaseAdmin().from('monitor_breaches').select('*')
    .eq('user_id', userId).eq('rule_id', ruleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  ensure(error, 'monitor_breaches.list');
  return Object.freeze([...(data ?? [])] as MonitorBreachRow[]);
}
