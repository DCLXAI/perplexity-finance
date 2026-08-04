-- Perplexity Finance v1.4.0: fair alert scheduling, operational heartbeats and market ledger.

alter table public.price_alerts
  add column if not exists last_evaluated_at timestamptz,
  add column if not exists evaluation_lease_until timestamptz;

create index if not exists price_alerts_fair_evaluation_idx
  on public.price_alerts(coalesce(last_evaluated_at, created_at), created_at)
  where state = 'armed';

create or replace function public.claim_due_price_alerts(
  p_limit integer,
  p_lease_seconds integer
) returns setof public.price_alerts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.price_alerts
    where state = 'armed'
      and (evaluation_lease_until is null or evaluation_lease_until <= timezone('utc', now()))
    order by coalesce(last_evaluated_at, created_at) asc, created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 500))
  )
  update public.price_alerts a
  set evaluation_lease_until = timezone('utc', now())
      + make_interval(secs => greatest(30, least(p_lease_seconds, 900)))
  from candidates c
  where a.id = c.id
  returning a.*;
end;
$$;
revoke all on function public.claim_due_price_alerts(integer, integer) from public;
grant execute on function public.claim_due_price_alerts(integer, integer) to service_role;

create or replace function public.complete_price_alert_observation(
  p_alert_id uuid,
  p_price numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.price_alerts
  set last_observed_price = p_price,
      last_evaluated_at = timezone('utc', now()),
      evaluation_lease_until = null
  where id = p_alert_id and state = 'armed';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.complete_price_alert_observation(uuid, numeric) from public;
grant execute on function public.complete_price_alert_observation(uuid, numeric) to service_role;

create or replace function public.release_price_alert_evaluation(
  p_alert_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.price_alerts
  set last_evaluated_at = timezone('utc', now()),
      evaluation_lease_until = null
  where id = p_alert_id and state = 'armed';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.release_price_alert_evaluation(uuid) from public;
grant execute on function public.release_price_alert_evaluation(uuid) to service_role;

create or replace function public.claim_price_alert(
  p_alert_id uuid,
  p_price numeric,
  p_provenance jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.price_alerts
  set state = 'triggered',
      triggered_at = timezone('utc', now()),
      triggered_price = p_price,
      triggered_provenance = p_provenance,
      last_observed_price = p_price,
      last_evaluated_at = timezone('utc', now()),
      evaluation_lease_until = null,
      seen = false
  where id = p_alert_id and state = 'armed';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.claim_price_alert(uuid, numeric, jsonb) from public;
grant execute on function public.claim_price_alert(uuid, numeric, jsonb) to service_role;

create table if not exists public.system_heartbeats (
  name text primary key,
  last_seen_at timestamptz not null default timezone('utc', now()),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists system_heartbeats_set_updated_at on public.system_heartbeats;
create trigger system_heartbeats_set_updated_at
  before update on public.system_heartbeats
  for each row execute function public.set_updated_at();

create table if not exists public.market_observations (
  id bigint generated always as identity primary key,
  symbol text not null check(symbol ~ '^[A-Z0-9./-]{1,20}$'),
  price numeric not null check(price > 0),
  as_of timestamptz not null,
  captured_at timestamptz not null default timezone('utc', now()),
  provider text not null,
  mode text not null,
  quality text not null,
  lineage_id text,
  provenance jsonb not null
);
create index if not exists market_observations_symbol_time_idx
  on public.market_observations(symbol, captured_at desc);
create index if not exists market_observations_captured_idx
  on public.market_observations(captured_at desc);
create unique index if not exists market_observations_dedupe_idx
  on public.market_observations(symbol, as_of, provider);

create table if not exists public.data_quality_incidents (
  id uuid primary key,
  kind text not null,
  severity text not null check(severity in ('info', 'warning', 'critical')),
  symbol text,
  providers text[] not null default '{}',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  resolved_at timestamptz
);
create index if not exists data_quality_incidents_open_idx
  on public.data_quality_incidents(created_at desc)
  where resolved_at is null;

alter table public.system_heartbeats enable row level security;
alter table public.market_observations enable row level security;
alter table public.data_quality_incidents enable row level security;
revoke all on public.system_heartbeats, public.market_observations, public.data_quality_incidents from anon, authenticated;

create or replace function public.retry_failed_alert_deliveries(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  with candidates as (
    select id
    from public.alert_deliveries
    where status = 'failed'
    order by updated_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 500))
  )
  update public.alert_deliveries d
  set status = 'retry',
      next_attempt_at = timezone('utc', now()),
      last_error = coalesce(last_error, 'Manual retry requested')
  from candidates c
  where d.id = c.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.retry_failed_alert_deliveries(integer) from public;
grant execute on function public.retry_failed_alert_deliveries(integer) to service_role;

create or replace function public.prune_finance_operational_data(p_retention_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare total integer := 0; changed integer;
begin
  delete from public.market_observations
  where captured_at < timezone('utc', now()) - make_interval(days => greatest(7, least(p_retention_days, 730)));
  get diagnostics changed = row_count;
  total := total + changed;

  delete from public.data_quality_incidents
  where created_at < timezone('utc', now()) - make_interval(days => greatest(7, least(p_retention_days, 730)))
    and resolved_at is not null;
  get diagnostics changed = row_count;
  total := total + changed;

  delete from public.ai_audits
  where created_at < timezone('utc', now()) - make_interval(days => greatest(7, least(p_retention_days, 730)));
  get diagnostics changed = row_count;
  total := total + changed;
  return total;
end;
$$;
revoke all on function public.prune_finance_operational_data(integer) from public;
grant execute on function public.prune_finance_operational_data(integer) to service_role;

-- Operational snapshots, idempotent control-plane actions and release evidence.
create table if not exists public.provider_health_snapshots (
  id bigint generated always as identity primary key,
  provider text not null,
  configured boolean not null,
  status text not null check(status in ('up', 'degraded', 'down', 'disabled')),
  mode text not null,
  latency_ms numeric,
  p95_latency_ms numeric,
  attempts integer not null default 0,
  success_rate numeric not null default 0,
  circuit_state text,
  consecutive_failures integer not null default 0,
  message text not null,
  checked_at timestamptz not null,
  captured_at timestamptz not null default timezone('utc', now())
);
create index if not exists provider_health_snapshots_time_idx
  on public.provider_health_snapshots(provider, captured_at desc);

create table if not exists public.ops_action_idempotency (
  idempotency_key text not null,
  action text not null,
  response jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  primary key(idempotency_key, action)
);
create index if not exists ops_action_idempotency_expiry_idx
  on public.ops_action_idempotency(expires_at);

create table if not exists public.ops_audit_log (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  request_id text not null,
  idempotency_key text not null,
  accepted boolean not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ops_audit_log_time_idx on public.ops_audit_log(created_at desc);

create table if not exists public.release_gate_runs (
  id bigint generated always as identity primary key,
  request_id text not null unique,
  version text not null,
  release_channel text not null,
  git_sha text,
  status text not null check(status in ('pass', 'warn', 'fail')),
  reasons text[] not null default '{}',
  readiness jsonb not null,
  slo jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists release_gate_runs_time_idx on public.release_gate_runs(created_at desc);

alter table public.provider_health_snapshots enable row level security;
alter table public.ops_action_idempotency enable row level security;
alter table public.ops_audit_log enable row level security;
alter table public.release_gate_runs enable row level security;
revoke all on public.provider_health_snapshots, public.ops_action_idempotency, public.ops_audit_log, public.release_gate_runs from anon, authenticated;

create or replace function public.prune_finance_operational_data(p_retention_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare total integer := 0; changed integer; cutoff timestamptz;
begin
  cutoff := timezone('utc', now()) - make_interval(days => greatest(7, least(p_retention_days, 730)));

  delete from public.market_observations where captured_at < cutoff;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.provider_health_snapshots where captured_at < cutoff;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.data_quality_incidents where created_at < cutoff and resolved_at is not null;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.ai_audits where created_at < cutoff;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.ops_audit_log where created_at < cutoff;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.release_gate_runs where created_at < cutoff;
  get diagnostics changed = row_count; total := total + changed;
  delete from public.ops_action_idempotency where expires_at < timezone('utc', now());
  get diagnostics changed = row_count; total := total + changed;
  return total;
end;
$$;
revoke all on function public.prune_finance_operational_data(integer) from public;
grant execute on function public.prune_finance_operational_data(integer) to service_role;

-- Cross-instance SLO evidence for serverless deployments. Provider snapshots
-- represent scheduled probe outcomes; market observations provide freshness.
create or replace function public.market_slo_evidence(p_window_minutes integer)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with bounds as (
    select timezone('utc', now()) - make_interval(mins => greatest(5, least(p_window_minutes, 1440))) as cutoff
  ),
  provider_samples as (
    select
      count(*) filter (where configured and attempts > 0) as attempts,
      count(*) filter (where configured and attempts > 0 and status = 'up') as successes,
      coalesce(
        jsonb_agg(latency_ms order by captured_at)
          filter (where configured and attempts > 0 and latency_ms is not null),
        '[]'::jsonb
      ) as latencies
    from public.provider_health_snapshots, bounds
    where captured_at >= bounds.cutoff
  ),
  freshness_samples as (
    select coalesce(
      jsonb_agg(greatest(0, extract(epoch from (captured_at - as_of))) order by captured_at),
      '[]'::jsonb
    ) as freshness_seconds
    from public.market_observations, bounds
    where captured_at >= bounds.cutoff
  )
  select jsonb_build_object(
    'attempts', provider_samples.attempts,
    'successes', provider_samples.successes,
    'latencies', provider_samples.latencies,
    'freshnessSeconds', freshness_samples.freshness_seconds,
    'sampledAt', timezone('utc', now())
  )
  from provider_samples cross join freshness_samples;
$$;
revoke all on function public.market_slo_evidence(integer) from public;
grant execute on function public.market_slo_evidence(integer) to service_role;
