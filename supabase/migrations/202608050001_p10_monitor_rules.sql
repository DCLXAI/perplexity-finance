-- P10: rule-based portfolio monitoring. Additive; no existing table is altered.

create table if not exists public.monitor_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  thesis_id uuid references public.investment_theses(id) on delete cascade,
  symbol text check (symbol is null or (symbol = upper(symbol) and char_length(symbol) between 1 and 20)),
  kind text not null check (kind in ('thesis_invalidation', 'risk_threshold', 'stress_scenario')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  enabled boolean not null default true,
  state text not null default 'armed' check (state in ('armed', 'latched')),
  last_outcome text check (last_outcome is null or last_outcome in ('breached', 'clear', 'deferred', 'error')),
  last_evaluated_at timestamptz,
  last_observation jsonb not null default '{}'::jsonb,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  latched_at timestamptz,
  min_interval_hours smallint not null default 24 check (min_interval_hours between 1 and 8760),
  next_evaluation_at timestamptz not null default timezone('utc', now()),
  -- Claim lease for claim_due_monitor_rules, independent of the armed/latched business
  -- state and independent of next_evaluation_at. Mirrors price_alerts.evaluation_lease_until
  -- in 202607120002_p3_operations.sql: a short, fixed lease so a worker that claims a batch
  -- and crashes before calling record_monitor_evaluation self-heals without a separate
  -- stale-lease sweep, and so two concurrent claimers can never receive the same rule.
  evaluation_lease_until timestamptz,
  rule_version integer not null default 1 check (rule_version >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- thesis rules must name a symbol; portfolio-level rules must not.
  check ((kind = 'thesis_invalidation') = (symbol is not null))
);

create index if not exists monitor_rules_due_idx
  on public.monitor_rules(next_evaluation_at, portfolio_id)
  where enabled;
create index if not exists monitor_rules_owner_idx
  on public.monitor_rules(user_id, portfolio_id, kind);

create table if not exists public.monitor_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'dispatched')),
  breach_count integer not null default 0 check (breach_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  dispatched_at timestamptz
);
create index if not exists monitor_digests_open_idx
  on public.monitor_digests(user_id) where status = 'open';

create table if not exists public.monitor_breaches (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.monitor_rules(id) on delete cascade,
  digest_id uuid references public.monitor_digests(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  rule_version integer not null,
  kind text not null,
  spec jsonb not null,
  observed_value numeric(28, 8),
  threshold_value numeric(28, 8),
  observed_at timestamptz not null,
  input_quality text not null,
  source_snapshot_id bigint references public.portfolio_snapshots(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists monitor_breaches_rule_idx
  on public.monitor_breaches(rule_id, created_at desc);

create table if not exists public.monitor_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references public.monitor_digests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'disabled')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(digest_id, channel)
);
create index if not exists monitor_digest_deliveries_due_idx
  on public.monitor_digest_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.monitor_rules enable row level security;
alter table public.monitor_digests enable row level security;
alter table public.monitor_breaches enable row level security;
alter table public.monitor_digest_deliveries enable row level security;

drop policy if exists monitor_rules_select_own on public.monitor_rules;
create policy monitor_rules_select_own on public.monitor_rules for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_digests_select_own on public.monitor_digests;
create policy monitor_digests_select_own on public.monitor_digests for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_breaches_select_own on public.monitor_breaches;
create policy monitor_breaches_select_own on public.monitor_breaches for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists monitor_digest_deliveries_select_own on public.monitor_digest_deliveries;
create policy monitor_digest_deliveries_select_own on public.monitor_digest_deliveries for select to authenticated
  using (auth.uid() = user_id);

-- Table-level grants follow the 202607130001_p6_target_allocations.sql pattern for
-- RLS-protected, select-own tables: authenticated gets SELECT only (rows are still
-- filtered by the policies above), anon gets nothing at all, and service_role gets
-- SELECT but not direct writes -- all writes go through the security-definer RPCs
-- below, which run as the owning role and bypass these grants entirely.
grant select on public.monitor_rules, public.monitor_digests, public.monitor_breaches,
  public.monitor_digest_deliveries to authenticated;
revoke all on public.monitor_rules, public.monitor_digests, public.monitor_breaches,
  public.monitor_digest_deliveries from anon;
revoke insert, update, delete on public.monitor_rules, public.monitor_digests,
  public.monitor_breaches, public.monitor_digest_deliveries from authenticated;
revoke insert, update, delete on public.monitor_rules, public.monitor_digests,
  public.monitor_breaches, public.monitor_digest_deliveries from service_role;
grant select on public.monitor_rules, public.monitor_digests, public.monitor_breaches,
  public.monitor_digest_deliveries to service_role;

-- Validates a spec against its kind. Mirrors server/monitors/rules.ts so a direct RPC call
-- cannot store a shape the evaluator would later refuse to parse.
--
-- NULL-safety notes (fix round 1 review):
--   * thesis_invalidation: `value` presence is checked with `?` (satisfied by a JSON
--     null), so the numeric-cast check is split into its own `if jsonb_typeof(...) <>
--     'number'` guard first -- a JSON null, string, object, etc. is rejected before any
--     `::numeric` cast is attempted, and the same treatment is applied to `condition`
--     (`is null or ... not in (...)`) since a JSON-null `condition` would otherwise pass
--     `?` and then have `not in` silently evaluate to NULL and fail to raise.
--   * risk_threshold: the brief had no key-presence check at all, so `{}`,
--     `{"comparison":"above"}` and `{"metric":"maxDrawdownPct"}` all passed silently
--     (`NULL not in (...)` is NULL, not TRUE). `is null or ... not in (...)` closes this
--     for both `metric` and `comparison`.
--   * stress_scenario: assigns a boolean into `v_shocks_invalid` via a CASE expression
--     *before* the `if`, rather than inlining the CASE into the `if` condition -- PL/pgSQL's
--     `IF <expr> THEN` reads up to the first `THEN` token without tracking CASE/END
--     nesting, so an inlined `if case when ... then ... end then` truncates at the CASE's
--     own `then` and fails to parse. The WHEN guard uses `is distinct from` instead of
--     `<>` so an absent `shocks` key (SQL NULL) is treated as "not an array" (TRUE) rather
--     than being swallowed to NULL/false by ordinary `<>` semantics; only once the WHEN has
--     confirmed the value is actually a JSON array does the ELSE branch call
--     jsonb_array_length, so that function is never invoked against a non-array scalar
--     (which would otherwise raise a raw "cannot get array length of a scalar" error).
create or replace function public.validate_monitor_rule_spec(p_kind text, p_spec jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_shocks_invalid boolean;
begin
  if p_kind = 'thesis_invalidation' then
    if not (p_spec ? 'condition' and p_spec ? 'symbol' and p_spec ? 'value') then
      raise exception 'thesis_invalidation spec requires condition, symbol, value';
    end if;
    if p_spec->>'condition' is null or p_spec->>'condition' not in
      ('price_below','price_above','drawdown_from_entry_pct','weight_above_pct','no_verified_price_days') then
      raise exception 'unknown thesis condition %', p_spec->>'condition';
    end if;
    if jsonb_typeof(p_spec->'value') <> 'number' then
      raise exception 'thesis threshold must be positive';
    end if;
    if (p_spec->>'value')::numeric <= 0 then
      raise exception 'thesis threshold must be positive';
    end if;
  elsif p_kind = 'risk_threshold' then
    if p_spec->>'metric' is null or p_spec->>'metric' not in
      ('annualizedVolatilityPct','historicalVar95Pct','historicalCvar95Pct',
       'maxDrawdownPct','concentrationHhi','topHoldingPct') then
      raise exception 'unknown risk metric %', p_spec->>'metric';
    end if;
    if p_spec->>'comparison' is null or p_spec->>'comparison' not in ('above','below') then
      raise exception 'unknown comparison %', p_spec->>'comparison';
    end if;
  elsif p_kind = 'stress_scenario' then
    v_shocks_invalid := case
      when jsonb_typeof(p_spec->'shocks') is distinct from 'array' then true
      else jsonb_array_length(p_spec->'shocks') not between 1 and 20
    end;
    if v_shocks_invalid then
      raise exception 'stress_scenario requires 1..20 shocks';
    end if;
    if jsonb_typeof(p_spec->'maxProjectedLossPct') <> 'number' then
      raise exception 'maxProjectedLossPct must be non-negative';
    end if;
    if (p_spec->>'maxProjectedLossPct')::numeric < 0 then
      raise exception 'maxProjectedLossPct must be non-negative';
    end if;
  else
    raise exception 'unknown monitor rule kind %', p_kind;
  end if;
end;
$$;
revoke all on function public.validate_monitor_rule_spec(text, jsonb) from public, anon, authenticated;
grant execute on function public.validate_monitor_rule_spec(text, jsonb) to service_role;

-- Editing a rule increments rule_version and re-arms it, so an edited threshold cannot be
-- swallowed by a latch left over from the previous threshold.
create or replace function public.upsert_monitor_rule(
  p_user_id uuid, p_portfolio_id uuid, p_rule_id uuid, p_thesis_id uuid,
  p_symbol text, p_kind text, p_spec jsonb, p_enabled boolean, p_min_interval_hours smallint
) returns public.monitor_rules language plpgsql security definer set search_path = public as $$
declare v_row public.monitor_rules;
begin
  perform public.validate_monitor_rule_spec(p_kind, p_spec);
  if not exists (select 1 from public.portfolios where id = p_portfolio_id and user_id = p_user_id) then
    raise exception 'portfolio not found for user';
  end if;

  if p_rule_id is null then
    insert into public.monitor_rules
      (user_id, portfolio_id, thesis_id, symbol, kind, spec, enabled, min_interval_hours, next_evaluation_at)
    values
      (p_user_id, p_portfolio_id, p_thesis_id, p_symbol, p_kind, p_spec, p_enabled,
       p_min_interval_hours, timezone('utc', now()))
    returning * into v_row;
  else
    update public.monitor_rules set
      thesis_id = p_thesis_id, symbol = p_symbol, spec = p_spec, enabled = p_enabled,
      min_interval_hours = p_min_interval_hours,
      state = 'armed', latched_at = null,
      rule_version = rule_version + 1,
      next_evaluation_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = p_rule_id and user_id = p_user_id and kind = p_kind
    returning * into v_row;
    if v_row.id is null then raise exception 'monitor rule not found'; end if;
  end if;
  return v_row;
end;
$$;
revoke all on function public.upsert_monitor_rule(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, smallint) from public, anon, authenticated;
grant execute on function public.upsert_monitor_rule(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, smallint) to service_role;

create or replace function public.delete_monitor_rule(p_user_id uuid, p_rule_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.monitor_rules where id = p_rule_id and user_id = p_user_id;
end;
$$;
revoke all on function public.delete_monitor_rule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_monitor_rule(uuid, uuid) to service_role;

-- Claims due rules with `for update skip locked` so concurrent workers get disjoint sets:
-- two concurrent callers can never receive the same row. The matched rows are leased
-- forward via evaluation_lease_until (a fixed, short window, independent of the rule's own
-- min_interval_hours) so a worker that claims a batch and then crashes before calling
-- record_monitor_evaluation does not block that rule from being re-claimed forever.
--
-- The ORDER BY selects WHICH rules are claimed -- oldest-waiting (by next_evaluation_at)
-- first, then by portfolio_id, so no batch can starve a later rule -- but it does NOT
-- determine the order rows are returned in: this is `UPDATE ... FROM due ... RETURNING`,
-- not a plain SELECT, and Postgres does not guarantee RETURNING preserves the CTE's scan
-- order. Callers that need per-portfolio grouping (e.g. to build one shared observation per
-- portfolio) must group explicitly, such as with a Map keyed on portfolio_id; do not rely
-- on adjacency in the returned rows.
--
-- Follows the claim_due_portfolio_rebalance_deliveries shape in
-- 202607130002_p7_rebalance_workflow.sql (CTE select ... for update skip locked, then
-- UPDATE ... FROM ... RETURNING, which has the identical unordered-output property),
-- adapted to lease via evaluation_lease_until instead of a status column because
-- monitor_rules.state is deliberately restricted to the armed/latched latch and must not
-- gain a third, unrelated "processing" value.
create or replace function public.claim_due_monitor_rules(p_limit integer default 200)
returns setof public.monitor_rules language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from public.monitor_rules
    where enabled
      and next_evaluation_at <= timezone('utc', now())
      and (evaluation_lease_until is null or evaluation_lease_until <= timezone('utc', now()))
    order by next_evaluation_at asc, portfolio_id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 200), 600))
  )
  update public.monitor_rules m
  set evaluation_lease_until = timezone('utc', now()) + interval '10 minutes'
  from due
  where m.id = due.id
  returning m.*;
end;
$$;
revoke all on function public.claim_due_monitor_rules(integer) from public, anon, authenticated;
grant execute on function public.claim_due_monitor_rules(integer) to service_role;

-- Also clears the evaluation_lease_until claim taken by claim_due_monitor_rules, so the
-- rule becomes claimable again exactly on the schedule this call sets rather than only
-- after the claim lease's own fixed window expires.
create or replace function public.record_monitor_evaluation(
  p_rule_id uuid, p_outcome text, p_state text, p_observation jsonb,
  p_error text, p_next_evaluation_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.monitor_rules set
    last_outcome = p_outcome,
    state = p_state,
    latched_at = case when p_state = 'latched' and state = 'armed' then timezone('utc', now())
                      when p_state = 'armed' then null else latched_at end,
    last_observation = coalesce(p_observation, '{}'::jsonb),
    last_error = p_error,
    last_evaluated_at = timezone('utc', now()),
    next_evaluation_at = p_next_evaluation_at,
    evaluation_lease_until = null,
    updated_at = timezone('utc', now())
  where id = p_rule_id;
end;
$$;
revoke all on function public.record_monitor_evaluation(uuid, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_monitor_evaluation(uuid, text, text, jsonb, text, timestamptz) to service_role;

create or replace function public.open_monitor_digest(p_user_id uuid)
returns public.monitor_digests language plpgsql security definer set search_path = public as $$
declare v_row public.monitor_digests;
begin
  select * into v_row from public.monitor_digests
    where user_id = p_user_id and status = 'open' limit 1;
  if v_row.id is null then
    insert into public.monitor_digests (user_id) values (p_user_id) returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.open_monitor_digest(uuid) from public, anon, authenticated;
grant execute on function public.open_monitor_digest(uuid) to service_role;

create or replace function public.append_monitor_breach(
  p_rule_id uuid, p_digest_id uuid, p_user_id uuid, p_portfolio_id uuid, p_rule_version integer,
  p_kind text, p_spec jsonb, p_observed numeric, p_threshold numeric,
  p_observed_at timestamptz, p_input_quality text, p_snapshot_id bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.monitor_breaches
    (rule_id, digest_id, user_id, portfolio_id, rule_version, kind, spec,
     observed_value, threshold_value, observed_at, input_quality, source_snapshot_id)
  values
    (p_rule_id, p_digest_id, p_user_id, p_portfolio_id, p_rule_version, p_kind, p_spec,
     p_observed, p_threshold, p_observed_at, p_input_quality, p_snapshot_id)
  returning id into v_id;
  update public.monitor_digests set breach_count = breach_count + 1 where id = p_digest_id;
  return v_id;
end;
$$;
revoke all on function public.append_monitor_breach(uuid, uuid, uuid, uuid, integer, text, jsonb, numeric, numeric, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.append_monitor_breach(uuid, uuid, uuid, uuid, integer, text, jsonb, numeric, numeric, timestamptz, text, bigint) to service_role;

-- Closes the digest and fans it out to both channels in one transaction. The status='open'
-- guard is taken under FOR UPDATE and flipped to 'dispatched' before returning, so a repeat
-- call for the same digest_id (sequential or concurrent) finds no open row and returns 0
-- without inserting anything; the unique(digest_id, channel) constraint with ON CONFLICT DO
-- NOTHING is a second, independent guard against duplicate delivery rows within one call.
create or replace function public.enqueue_monitor_digest_deliveries(p_digest_id uuid, p_payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_count integer := 0;
begin
  select user_id into v_user from public.monitor_digests
    where id = p_digest_id and status = 'open' for update;
  if v_user is null then return 0; end if;

  insert into public.monitor_digest_deliveries (digest_id, user_id, channel, payload)
  select p_digest_id, v_user, channel, p_payload from unnest(array['email','push']) as channel
  on conflict (digest_id, channel) do nothing;
  get diagnostics v_count = row_count;

  update public.monitor_digests
    set status = 'dispatched', dispatched_at = timezone('utc', now())
    where id = p_digest_id;
  return v_count;
end;
$$;
revoke all on function public.enqueue_monitor_digest_deliveries(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_monitor_digest_deliveries(uuid, jsonb) to service_role;

create or replace function public.claim_due_monitor_digest_deliveries(p_limit integer default 50)
returns setof public.monitor_digest_deliveries language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.monitor_digest_deliveries set status = 'processing', updated_at = timezone('utc', now())
  where id in (
    select id from public.monitor_digest_deliveries
    where status in ('pending', 'retry')
      and (next_attempt_at is null or next_attempt_at <= timezone('utc', now()))
    order by created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 250))
    for update skip locked
  )
  returning *;
end;
$$;
revoke all on function public.claim_due_monitor_digest_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_due_monitor_digest_deliveries(integer) to service_role;

create or replace function public.mark_monitor_digest_delivery_sent(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries
    set status = 'sent', sent_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = p_id;
$$;
revoke all on function public.mark_monitor_digest_delivery_sent(uuid) from public, anon, authenticated;
grant execute on function public.mark_monitor_digest_delivery_sent(uuid) to service_role;

create or replace function public.mark_monitor_digest_delivery_failure(
  p_id uuid, p_attempts integer, p_error text, p_next_attempt_at timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries set
    status = case when p_next_attempt_at is null then 'failed' else 'retry' end,
    attempts = p_attempts + 1, last_error = p_error,
    next_attempt_at = p_next_attempt_at, updated_at = timezone('utc', now())
  where id = p_id;
$$;
revoke all on function public.mark_monitor_digest_delivery_failure(uuid, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_monitor_digest_delivery_failure(uuid, integer, text, timestamptz) to service_role;

create or replace function public.mark_monitor_digest_delivery_disabled(p_id uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  update public.monitor_digest_deliveries
    set status = 'disabled', last_error = p_reason, updated_at = timezone('utc', now())
    where id = p_id;
$$;
revoke all on function public.mark_monitor_digest_delivery_disabled(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_monitor_digest_delivery_disabled(uuid, text) to service_role;

drop trigger if exists monitor_rules_set_updated_at on public.monitor_rules;
create trigger monitor_rules_set_updated_at
  before update on public.monitor_rules
  for each row execute function public.set_updated_at();
