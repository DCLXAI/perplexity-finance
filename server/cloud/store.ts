import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../auth/supabase.js';
import type {
  AiAnswerResponse,
  AlertCondition,
  AlertDeliverySummary,
  DataProvenance,
  DataQualityIncident,
  OpsAction,
  OpsActionResponse,
  OpsBacklogSummary,
  ProviderStatus,
  PushSubscriptionPayload,
  RemoteQuotePatch,
  ServerPriceAlert,
} from '../../src/shared/api.js';

interface WatchlistRow { symbols: string[]; updated_at: string }
interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  condition: AlertCondition;
  target: number | string;
  baseline: number | string;
  last_observed_price: number | string | null;
  state: 'armed' | 'triggered' | 'disabled';
  email_enabled: boolean;
  push_enabled: boolean;
  seen: boolean;
  triggered_at: string | null;
  triggered_price: number | string | null;
  triggered_provenance: DataProvenance | null;
  last_evaluated_at?: string | null;
  evaluation_lease_until?: string | null;
  created_at: string;
}
export interface ArmedAlertRow extends AlertRow {}
export interface DeliveryRow {
  id: string;
  alert_id: string;
  user_id: string;
  channel: 'email' | 'push';
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'failed' | 'disabled';
  attempts: number;
  payload: AlertDeliveryPayload;
  last_error: string | null;
  sent_at: string | null;
  next_attempt_at: string;
}
export interface PushRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expires_at: string | null;
}
export interface AlertDeliveryPayload {
  symbol: string;
  condition: AlertCondition;
  target: number;
  price: number;
  triggeredAt: string;
  provenance: DataProvenance;
}

function ensure(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}
const numeric = (value: number | string | null): number | undefined => value === null ? undefined : Number(value);
function delivery(row: DeliveryRow): AlertDeliverySummary {
  return Object.freeze({
    channel: row.channel,
    status: row.status,
    attempts: row.attempts,
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
  });
}
function alert(row: AlertRow, deliveries: readonly DeliveryRow[]): ServerPriceAlert {
  const lastObserved = numeric(row.last_observed_price);
  const triggeredPrice = numeric(row.triggered_price);
  return Object.freeze({
    id: row.id,
    symbol: row.symbol,
    condition: row.condition,
    target: Number(row.target),
    baseline: Number(row.baseline),
    ...(lastObserved === undefined ? {} : { lastObservedPrice: lastObserved }),
    createdAt: row.created_at,
    ...(row.triggered_at ? { triggeredAt: row.triggered_at } : {}),
    ...(triggeredPrice === undefined ? {} : { triggeredPrice }),
    ...(row.triggered_provenance ? { triggeredProvenance: row.triggered_provenance } : {}),
    seen: row.seen,
    state: row.state,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
    deliveries: Object.freeze(deliveries.map(delivery)),
  });
}

export async function getWatchlist(userId: string): Promise<{ symbols: readonly string[]; updatedAt: string }> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.from('watchlists').select('symbols,updated_at').eq('user_id', userId).maybeSingle();
  ensure(error, 'watchlist.select');
  const row = data as WatchlistRow | null;
  return row
    ? { symbols: Object.freeze(row.symbols), updatedAt: row.updated_at }
    : { symbols: Object.freeze([]), updatedAt: new Date().toISOString() };
}
export async function saveWatchlist(userId: string, symbols: readonly string[]): Promise<{ symbols: readonly string[]; updatedAt: string }> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.from('watchlists')
    .upsert({ user_id: userId, symbols: [...symbols] }, { onConflict: 'user_id' })
    .select('symbols,updated_at')
    .single();
  ensure(error, 'watchlist.upsert');
  const row = data as WatchlistRow;
  return { symbols: Object.freeze(row.symbols), updatedAt: row.updated_at };
}

export async function listAlerts(userId: string): Promise<readonly ServerPriceAlert[]> {
  const client = getSupabaseAdmin();
  const [{ data: alertData, error: alertError }, { data: deliveryData, error: deliveryError }] = await Promise.all([
    client.from('price_alerts').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('alert_deliveries').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  ensure(alertError, 'alerts.select');
  ensure(deliveryError, 'deliveries.select');
  const rows = (alertData ?? []) as AlertRow[];
  const deliveries = (deliveryData ?? []) as DeliveryRow[];
  return Object.freeze(rows.map((row) => alert(row, deliveries.filter((item) => item.alert_id === row.id))));
}
export async function countActiveAlerts(userId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('price_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('state', 'armed');
  ensure(error, 'alerts.count');
  return count ?? 0;
}
export async function createAlert(
  userId: string,
  input: { symbol: string; condition: AlertCondition; target: number; baseline: number; emailEnabled: boolean; pushEnabled: boolean },
): Promise<ServerPriceAlert> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.from('price_alerts').insert({
    user_id: userId,
    symbol: input.symbol,
    condition: input.condition,
    target: input.target,
    baseline: input.baseline,
    last_observed_price: input.baseline,
    email_enabled: input.emailEnabled,
    push_enabled: input.pushEnabled,
    seen: true,
    state: 'armed',
  }).select('*').single();
  ensure(error, 'alerts.insert');
  return alert(data as AlertRow, []);
}
export async function deleteAlert(userId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('price_alerts').delete().eq('id', id).eq('user_id', userId);
  ensure(error, 'alerts.delete');
}
export async function markAlertsSeen(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('price_alerts').update({ seen: true })
    .eq('user_id', userId).eq('state', 'triggered').eq('seen', false);
  ensure(error, 'alerts.seen');
}

export async function savePushSubscription(userId: string, subscription: PushSubscriptionPayload): Promise<void> {
  const { error } = await getSupabaseAdmin().from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expires_at: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
  }, { onConflict: 'endpoint' });
  ensure(error, 'push.upsert');
}
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  ensure(error, 'push.delete');
}
export async function listPushSubscriptions(userId: string): Promise<readonly PushRow[]> {
  const { data, error } = await getSupabaseAdmin().from('push_subscriptions')
    .select('id,endpoint,p256dh,auth,expires_at').eq('user_id', userId);
  ensure(error, 'push.select');
  return Object.freeze((data ?? []) as PushRow[]);
}
export async function deletePushSubscriptionById(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('push_subscriptions').delete().eq('id', id);
  ensure(error, 'push.delete_stale');
}

export async function claimAlertEvaluationBatch(limit: number, leaseSeconds: number): Promise<readonly ArmedAlertRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_due_price_alerts', {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  ensure(error, 'alerts.claim_evaluation');
  return Object.freeze((data ?? []) as ArmedAlertRow[]);
}
/** Backward-compatible read path used only by older tests and diagnostics. */
export async function listArmedAlerts(limit: number): Promise<readonly ArmedAlertRow[]> {
  const { data, error } = await getSupabaseAdmin().from('price_alerts').select('*')
    .eq('state', 'armed').order('created_at', { ascending: true }).limit(limit);
  ensure(error, 'alerts.armed');
  return Object.freeze((data ?? []) as ArmedAlertRow[]);
}
export async function completeObservedPrice(id: string, price: number): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('complete_price_alert_observation', {
    p_alert_id: id,
    p_price: price,
  });
  ensure(error, 'alerts.observe');
}
export async function updateObservedPrice(id: string, price: number): Promise<void> {
  await completeObservedPrice(id, price);
}
export async function releaseAlertEvaluation(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc('release_price_alert_evaluation', { p_alert_id: id });
  ensure(error, 'alerts.release_evaluation');
}
export async function claimAlert(id: string, price: number, provenance: DataProvenance): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_price_alert', {
    p_alert_id: id,
    p_price: price,
    p_provenance: provenance,
  });
  ensure(error, 'alerts.claim');
  return data === true;
}
export async function claimAlertAndEnqueue(
  id: string,
  price: number,
  provenance: DataProvenance,
  payload: AlertDeliveryPayload,
): Promise<Readonly<{ claimed: boolean; enqueued: number }>> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_price_alert_and_enqueue', {
    p_alert_id: id,
    p_price: price,
    p_provenance: provenance,
    p_payload: payload,
  });
  ensure(error, 'alerts.claim_and_enqueue');
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return Object.freeze({
    claimed: value.claimed === true,
    enqueued: Number.isFinite(Number(value.enqueued)) ? Math.max(0, Math.trunc(Number(value.enqueued))) : 0,
  });
}
export async function enqueueDeliveries(alertRow: ArmedAlertRow, payload: AlertDeliveryPayload): Promise<number> {
  const rows: Array<Record<string, unknown>> = [];
  if (alertRow.email_enabled) rows.push({ alert_id: alertRow.id, user_id: alertRow.user_id, channel: 'email', payload, status: 'pending' });
  if (alertRow.push_enabled) rows.push({ alert_id: alertRow.id, user_id: alertRow.user_id, channel: 'push', payload, status: 'pending' });
  if (!rows.length) return 0;
  const { error } = await getSupabaseAdmin().from('alert_deliveries')
    .upsert(rows, { onConflict: 'alert_id,channel', ignoreDuplicates: true });
  ensure(error, 'deliveries.enqueue');
  return rows.length;
}

export async function claimDueDeliveries(limit: number): Promise<readonly DeliveryRow[]> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_due_deliveries', { p_limit: limit });
  ensure(error, 'deliveries.claim');
  return Object.freeze((data ?? []) as DeliveryRow[]);
}
export async function markDeliverySent(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('alert_deliveries')
    .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
    .eq('id', id).eq('status', 'processing');
  ensure(error, 'delivery.sent');
}
export async function markDeliveryDisabled(id: string, reason: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('alert_deliveries')
    .update({ status: 'disabled', last_error: reason }).eq('id', id).eq('status', 'processing');
  ensure(error, 'delivery.disabled');
}
export async function markDeliveryFailure(id: string, attempts: number, message: string, next: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin().from('alert_deliveries').update({
    status: next ? 'retry' : 'failed',
    attempts,
    last_error: message.slice(0, 1000),
    ...(next ? { next_attempt_at: next } : {}),
  }).eq('id', id).eq('status', 'processing');
  ensure(error, 'delivery.failure');
}
export async function userForDelivery(id: string): Promise<User | null> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(id);
  if (error) throw new Error(`auth.user: ${error.message}`);
  return data.user ?? null;
}

export async function insertAiAudit(userId: string | null, response: AiAnswerResponse): Promise<void> {
  const { error } = await getSupabaseAdmin().from('ai_audits').insert({
    user_id: userId,
    request_id: response.requestId,
    model: response.model,
    mode: response.mode,
    tools_used: [...response.toolsUsed],
    sources: response.sources,
    input_tokens: response.usage?.inputTokens ?? 0,
    output_tokens: response.usage?.outputTokens ?? 0,
    total_tokens: response.usage?.totalTokens ?? 0,
  });
  ensure(error, 'ai.audit');
}

export async function writeHeartbeat(name: string, details: Readonly<Record<string, unknown>>): Promise<void> {
  const { error } = await getSupabaseAdmin().from('system_heartbeats').upsert({
    name,
    last_seen_at: new Date().toISOString(),
    details,
  }, { onConflict: 'name' });
  ensure(error, 'heartbeat.upsert');
}
export async function insertMarketObservations(quotes: readonly RemoteQuotePatch[]): Promise<number> {
  const accepted = quotes.filter((quote) => ['provider', 'verified'].includes(quote.provenance.quality));
  if (!accepted.length) return 0;
  const rows = accepted.map((quote) => ({
    symbol: quote.symbol,
    price: quote.price,
    as_of: quote.asOfISO,
    provider: quote.provenance.source,
    mode: quote.provenance.mode,
    quality: quote.provenance.quality,
    lineage_id: quote.provenance.verification?.lineageId ?? null,
    provenance: quote.provenance,
  }));
  const { error } = await getSupabaseAdmin().from('market_observations').upsert(rows, {
    onConflict: 'symbol,as_of,provider',
    ignoreDuplicates: true,
  });
  ensure(error, 'market_observations.insert');
  return rows.length;
}
export async function upsertIncidents(incidents: readonly DataQualityIncident[]): Promise<number> {
  if (!incidents.length) return 0;
  const { error } = await getSupabaseAdmin().from('data_quality_incidents').upsert(
    incidents.map((incident) => ({
      id: incident.id,
      kind: incident.kind,
      severity: incident.severity,
      symbol: incident.symbol ?? null,
      providers: [...incident.providers],
      message: incident.message,
      details: incident.details,
      created_at: incident.createdAt,
      resolved_at: incident.resolvedAt ?? null,
    })),
    { onConflict: 'id' },
  );
  ensure(error, 'incidents.upsert');
  return incidents.length;
}

export async function opsBacklog(): Promise<OpsBacklogSummary> {
  const client = getSupabaseAdmin();
  const [armed, pending, retry, failed, rebalancePending, rebalanceRetry, rebalanceFailed, unresolved, observations] = await Promise.all([
    client.from('price_alerts').select('id', { count: 'exact', head: true }).eq('state', 'armed'),
    client.from('alert_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('alert_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'retry'),
    client.from('alert_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    client.from('portfolio_rebalance_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('portfolio_rebalance_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'retry'),
    client.from('portfolio_rebalance_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    client.from('data_quality_incidents').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    client.from('market_observations').select('id', { count: 'exact', head: true })
      .gte('captured_at', new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  for (const [name, result] of [
    ['alerts', armed], ['deliveries.pending', pending], ['deliveries.retry', retry],
    ['deliveries.failed', failed], ['rebalance.pending', rebalancePending],
    ['rebalance.retry', rebalanceRetry], ['rebalance.failed', rebalanceFailed],
    ['incidents', unresolved], ['observations', observations],
  ] as const) ensure(result.error, `${name}.count`);
  return Object.freeze({
    armedAlerts: armed.count ?? 0,
    pendingDeliveries: (pending.count ?? 0) + (rebalancePending.count ?? 0),
    retryDeliveries: (retry.count ?? 0) + (rebalanceRetry.count ?? 0),
    failedDeliveries: (failed.count ?? 0) + (rebalanceFailed.count ?? 0),
    unresolvedIncidents: unresolved.count ?? 0,
    observations24h: observations.count ?? 0,
  });
}
export async function retryFailedDeliveries(limit: number): Promise<number> {
  const admin = getSupabaseAdmin();
  const [alerts, rebalances] = await Promise.all([
    admin.rpc('retry_failed_alert_deliveries', { p_limit: limit }),
    admin.rpc('retry_failed_portfolio_rebalance_deliveries', { p_limit: limit }),
  ]);
  ensure(alerts.error, 'deliveries.retry_failed');
  ensure(rebalances.error, 'rebalance_deliveries.retry_failed');
  return Number(alerts.data ?? 0) + Number(rebalances.data ?? 0);
}
export async function pruneOperationalData(retentionDays: number): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc('prune_finance_operational_data', { p_retention_days: retentionDays });
  ensure(error, 'operations.prune');
  return Number(data ?? 0);
}

interface IncidentRow {
  id: string;
  kind: DataQualityIncident['kind'];
  severity: DataQualityIncident['severity'];
  symbol: string | null;
  providers: DataQualityIncident['providers'];
  message: string;
  details: DataQualityIncident['details'];
  created_at: string;
  resolved_at: string | null;
}

export async function listOpenIncidents(limit: number): Promise<readonly DataQualityIncident[]> {
  const { data, error } = await getSupabaseAdmin().from('data_quality_incidents')
    .select('id,kind,severity,symbol,providers,message,details,created_at,resolved_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  ensure(error, 'incidents.select');
  return Object.freeze(((data ?? []) as IncidentRow[]).map((row) => Object.freeze({
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    ...(row.symbol ? { symbol: row.symbol } : {}),
    providers: Object.freeze([...(row.providers ?? [])]),
    message: row.message,
    details: Object.freeze({ ...(row.details ?? {}) }),
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
  })));
}

export async function listOperationalSymbols(limit: number): Promise<readonly string[]> {
  const client = getSupabaseAdmin();
  const [alerts, watchlists] = await Promise.all([
    client.from('price_alerts').select('symbol').eq('state', 'armed').limit(Math.max(1, Math.min(limit, 500))),
    client.from('watchlists').select('symbols').limit(250),
  ]);
  ensure(alerts.error, 'operations.alert_symbols');
  ensure(watchlists.error, 'operations.watchlist_symbols');
  const values = [
    ...((alerts.data ?? []) as Array<{ symbol: string }>).map((row) => row.symbol),
    ...((watchlists.data ?? []) as Array<{ symbols: string[] }>).flatMap((row) => row.symbols ?? []),
  ];
  return Object.freeze([...new Set(values.map((value) => value.toUpperCase()))].slice(0, Math.max(1, Math.min(limit, 500))));
}

export async function insertProviderHealthSnapshots(statuses: readonly ProviderStatus[]): Promise<number> {
  if (!statuses.length) return 0;
  const rows = statuses.map((status) => ({
    provider: status.provider,
    configured: status.configured,
    status: status.status,
    mode: status.mode,
    latency_ms: status.latencyMs ?? null,
    p95_latency_ms: status.p95LatencyMs ?? null,
    attempts: status.attempts ?? 0,
    success_rate: status.successRate ?? 0,
    circuit_state: status.circuitState ?? null,
    consecutive_failures: status.consecutiveFailures ?? 0,
    message: status.message,
    checked_at: status.checkedAt,
  }));
  const { error } = await getSupabaseAdmin().from('provider_health_snapshots').insert(rows);
  ensure(error, 'provider_health_snapshots.insert');
  return rows.length;
}


interface ProviderHealthSnapshotRow {
  provider: ProviderStatus['provider'];
  configured: boolean;
  status: ProviderStatus['status'];
  mode: ProviderStatus['mode'];
  latency_ms: number | string | null;
  p95_latency_ms: number | string | null;
  attempts: number | string;
  success_rate: number | string;
  circuit_state: ProviderStatus['circuitState'] | null;
  consecutive_failures: number | string;
  message: string;
  checked_at: string;
  captured_at: string;
}

export interface SystemHeartbeatEvidence {
  readonly name: string;
  readonly lastSeenAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PersistentSloEvidence {
  readonly attempts: number;
  readonly successes: number;
  readonly latencies: readonly number[];
  readonly freshnessSeconds: readonly number[];
  readonly sampledAt: string;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
function finiteNumbers(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map((entry) => finiteNumber(entry, Number.NaN)).filter(Number.isFinite));
}

export async function latestProviderHealthSnapshots(windowMinutes = 60): Promise<readonly ProviderStatus[]> {
  const since = new Date(Date.now() - Math.max(5, Math.min(windowMinutes, 1_440)) * 60_000).toISOString();
  const { data, error } = await getSupabaseAdmin().from('provider_health_snapshots')
    .select('provider,configured,status,mode,latency_ms,p95_latency_ms,attempts,success_rate,circuit_state,consecutive_failures,message,checked_at,captured_at')
    .gte('captured_at', since)
    .order('captured_at', { ascending: false })
    .limit(500);
  ensure(error, 'provider_health_snapshots.select');
  const byProvider = new Map<ProviderStatus['provider'], ProviderStatus>();
  for (const row of (data ?? []) as ProviderHealthSnapshotRow[]) {
    if (byProvider.has(row.provider)) continue;
    const latency = row.latency_ms === null ? undefined : finiteNumber(row.latency_ms, Number.NaN);
    const p95 = row.p95_latency_ms === null ? undefined : finiteNumber(row.p95_latency_ms, Number.NaN);
    byProvider.set(row.provider, Object.freeze({
      provider: row.provider,
      configured: Boolean(row.configured),
      status: row.status,
      mode: row.mode,
      message: row.message,
      checkedAt: row.checked_at,
      ...(latency !== undefined && Number.isFinite(latency) ? { latencyMs: latency } : {}),
      ...(p95 !== undefined && Number.isFinite(p95) ? { p95LatencyMs: p95 } : {}),
      attempts: Math.max(0, Math.trunc(finiteNumber(row.attempts))),
      successRate: Math.max(0, Math.min(1, finiteNumber(row.success_rate))),
      ...(row.circuit_state ? { circuitState: row.circuit_state } : {}),
      consecutiveFailures: Math.max(0, Math.trunc(finiteNumber(row.consecutive_failures))),
      evidenceSource: 'persistent-ledger',
      sampledAt: row.captured_at,
    }));
  }
  return Object.freeze([...byProvider.values()]);
}

export async function readSystemHeartbeats(names: readonly string[]): Promise<readonly SystemHeartbeatEvidence[]> {
  if (!names.length) return Object.freeze([]);
  const { data, error } = await getSupabaseAdmin().from('system_heartbeats')
    .select('name,last_seen_at,details')
    .in('name', [...new Set(names)]);
  ensure(error, 'heartbeats.select');
  return Object.freeze(((data ?? []) as Array<{ name: string; last_seen_at: string; details: Record<string, unknown> | null }>).map((row) => Object.freeze({
    name: row.name,
    lastSeenAt: row.last_seen_at,
    details: Object.freeze({ ...(row.details ?? {}) }),
  })));
}

export async function persistentMarketSloEvidence(windowMinutes = 60): Promise<PersistentSloEvidence> {
  const minutes = Math.max(5, Math.min(Math.trunc(windowMinutes), 1_440));
  const { data, error } = await getSupabaseAdmin().rpc('market_slo_evidence', { p_window_minutes: minutes });
  ensure(error, 'market_slo_evidence');
  const raw = Array.isArray(data) ? data[0] : data;
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const attempts = Math.max(0, Math.trunc(finiteNumber(value.attempts)));
  const successes = Math.max(0, Math.min(attempts, Math.trunc(finiteNumber(value.successes))));
  const sampledAt = typeof value.sampledAt === 'string' && Number.isFinite(new Date(value.sampledAt).getTime())
    ? value.sampledAt
    : new Date().toISOString();
  return Object.freeze({
    attempts,
    successes,
    latencies: finiteNumbers(value.latencies),
    freshnessSeconds: finiteNumbers(value.freshnessSeconds),
    sampledAt,
  });
}

export type OpsActionClaim =
  | Readonly<{ state: 'claimed' }>
  | Readonly<{ state: 'in-progress'; retryAt?: string }>
  | Readonly<{ state: 'completed'; response: OpsActionResponse }>;

export async function claimOpsAction(
  key: string,
  action: OpsAction,
  requestId: string,
  leaseSeconds = 120,
): Promise<OpsActionClaim> {
  const { data, error } = await getSupabaseAdmin().rpc('claim_ops_action', {
    p_idempotency_key: key,
    p_action: action,
    p_request_id: requestId,
    p_lease_seconds: leaseSeconds,
  });
  ensure(error, 'ops.idempotency.claim');
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (value.state === 'completed' && value.response && typeof value.response === 'object') {
    return Object.freeze({ state: 'completed', response: value.response as OpsActionResponse });
  }
  if (value.state === 'in-progress') {
    return Object.freeze({
      state: 'in-progress',
      ...(typeof value.retryAt === 'string' ? { retryAt: value.retryAt } : {}),
    });
  }
  if (value.state === 'claimed') return Object.freeze({ state: 'claimed' });
  throw new Error('ops.idempotency.claim: invalid response');
}

export async function completeOpsAction(
  key: string,
  action: OpsAction,
  requestId: string,
  response: OpsActionResponse,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc('complete_ops_action', {
    p_idempotency_key: key,
    p_action: action,
    p_request_id: requestId,
    p_response: response,
    p_retention_seconds: 24 * 60 * 60,
  });
  ensure(error, 'ops.idempotency.complete');
  return data === true;
}

export async function releaseOpsAction(
  key: string,
  action: OpsAction,
  requestId: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc('release_ops_action', {
    p_idempotency_key: key,
    p_action: action,
    p_request_id: requestId,
  });
  ensure(error, 'ops.idempotency.release');
  return data === true;
}

export async function insertOpsAudit(input: {
  actorId: string;
  action: OpsAction;
  requestId: string;
  idempotencyKey: string;
  accepted: boolean;
  result: Readonly<Record<string, unknown>>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from('ops_audit_log').insert({
    actor_id: input.actorId,
    action: input.action,
    request_id: input.requestId,
    idempotency_key: input.idempotencyKey,
    accepted: input.accepted,
    result: input.result,
  });
  ensure(error, 'ops.audit.insert');
}

export async function insertReleaseGateRun(input: {
  requestId: string;
  status: 'pass' | 'warn' | 'fail';
  reasons: readonly string[];
  readiness: Readonly<Record<string, unknown>>;
  slo: Readonly<Record<string, unknown>>;
}): Promise<void> {
  const config = (await import('../config.js')).loadConfig();
  const { error } = await getSupabaseAdmin().from('release_gate_runs').insert({
    request_id: input.requestId,
    version: config.version,
    release_channel: config.releaseChannel,
    git_sha: config.gitSha ?? null,
    status: input.status,
    reasons: [...input.reasons],
    readiness: input.readiness,
    slo: input.slo,
  });
  ensure(error, 'release_gate_runs.insert');
}
