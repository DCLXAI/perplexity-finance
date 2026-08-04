-- Perplexity Finance v1.8.0 P7 durable rebalance workflow.
-- Persisted decision snapshots, approval audit, notification queue and atomic fills.

alter table public.portfolio_allocation_policies
  add column if not exists rebalance_email_enabled boolean not null default false,
  add column if not exists rebalance_push_enabled boolean not null default false,
  add column if not exists last_rebalance_scan_at timestamptz;

create index if not exists portfolio_allocation_policies_scan_fairness_idx
  on public.portfolio_allocation_policies(last_rebalance_scan_at nulls first, portfolio_id);

-- Operational scan cursors must not invalidate a user-authored policy version.
drop trigger if exists portfolio_allocation_policies_set_updated_at on public.portfolio_allocation_policies;
create trigger portfolio_allocation_policies_set_updated_at
  before update on public.portfolio_allocation_policies
  for each row
  when (
    old.drift_threshold_pct is distinct from new.drift_threshold_pct
    or old.min_trade_value is distinct from new.min_trade_value
    or old.rebalance_email_enabled is distinct from new.rebalance_email_enabled
    or old.rebalance_push_enabled is distinct from new.rebalance_push_enabled
  )
  execute function public.set_updated_at();

drop function if exists public.replace_portfolio_allocation_policy(uuid, uuid, numeric, numeric, jsonb);
create or replace function public.replace_portfolio_allocation_policy(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_drift_threshold_pct numeric,
  p_min_trade_value numeric,
  p_rebalance_email_enabled boolean,
  p_rebalance_push_enabled boolean,
  p_targets jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_id uuid;
  target_count integer;
  distinct_count integer;
  target_total numeric;
begin
  select id into owned_id
  from public.portfolios
  where id = p_portfolio_id and user_id = p_user_id and status = 'active'
  for update;
  if owned_id is null then raise exception 'active portfolio not found'; end if;

  if p_drift_threshold_pct <= 0 or p_drift_threshold_pct > 100 then
    raise exception 'drift threshold must be greater than 0 and at most 100';
  end if;
  if p_min_trade_value < 0 then raise exception 'minimum trade value cannot be negative'; end if;
  if jsonb_typeof(p_targets) <> 'array' then raise exception 'targets must be an array'; end if;

  select count(*), count(distinct upper(trim(value->>'symbol'))), coalesce(sum((value->>'targetPct')::numeric), 0)
    into target_count, distinct_count, target_total
  from jsonb_array_elements(p_targets)
  where jsonb_typeof(value) = 'object'
    and jsonb_typeof(value->'symbol') = 'string'
    and jsonb_typeof(value->'targetPct') = 'number'
    and upper(trim(value->>'symbol')) ~ '^[A-Z0-9.:-]{1,20}$'
    and (value->>'targetPct')::numeric > 0
    and (value->>'targetPct')::numeric <= 100;

  if target_count <> jsonb_array_length(p_targets) or target_count < 1 or target_count > 50 then
    raise exception 'targets contain invalid values or exceed the 50 target limit';
  end if;
  if distinct_count <> target_count then raise exception 'target symbols must be unique'; end if;
  if abs(target_total - 100) > 0.01 then raise exception 'target percentages must total 100'; end if;

  insert into public.portfolio_allocation_policies(
    portfolio_id, user_id, drift_threshold_pct, min_trade_value,
    rebalance_email_enabled, rebalance_push_enabled
  ) values (
    p_portfolio_id, p_user_id, p_drift_threshold_pct, p_min_trade_value,
    coalesce(p_rebalance_email_enabled, false), coalesce(p_rebalance_push_enabled, false)
  )
  on conflict (portfolio_id) do update set
    drift_threshold_pct = excluded.drift_threshold_pct,
    min_trade_value = excluded.min_trade_value,
    rebalance_email_enabled = excluded.rebalance_email_enabled,
    rebalance_push_enabled = excluded.rebalance_push_enabled,
    -- Targets are replaced below, so every policy save advances the version even
    -- when only target percentages changed.
    updated_at = timezone('utc', now());

  delete from public.portfolio_allocation_targets where portfolio_id = p_portfolio_id;
  insert into public.portfolio_allocation_targets(portfolio_id, user_id, symbol, target_pct)
  select p_portfolio_id, p_user_id, upper(trim(value->>'symbol')), (value->>'targetPct')::numeric
  from jsonb_array_elements(p_targets);
end;
$$;
revoke all on function public.replace_portfolio_allocation_policy(uuid, uuid, numeric, numeric, boolean, boolean, jsonb) from public;
grant execute on function public.replace_portfolio_allocation_policy(uuid, uuid, numeric, numeric, boolean, boolean, jsonb) to service_role;

create table if not exists public.portfolio_rebalance_runs (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'completed', 'rejected', 'expired')),
  source text not null check (source in ('manual', 'scheduled')),
  plan_hash text not null check (plan_hash ~ '^[a-f0-9]{64}$'),
  policy_updated_at timestamptz not null,
  portfolio_updated_at timestamptz not null,
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  valuation_as_of timestamptz not null,
  valuation_quality text not null check (valuation_quality in ('verified', 'mixed', 'estimated', 'unpriced')),
  total_value numeric(28, 8) not null check (total_value > 0),
  cash_balance numeric(28, 8) not null check (cash_balance >= 0),
  drift_threshold_pct numeric(8, 4) not null check (drift_threshold_pct > 0 and drift_threshold_pct <= 100),
  min_trade_value numeric(28, 8) not null check (min_trade_value >= 0),
  max_drift_pct numeric(12, 6) not null check (max_drift_pct >= 0),
  estimated_cash_after numeric(28, 8) not null,
  expires_at timestamptz not null,
  approved_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  terminal_reason text check (terminal_reason is null or char_length(terminal_reason) <= 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(id, user_id, portfolio_id),
  constraint portfolio_rebalance_runs_timestamps_check check (
    expires_at > created_at
    and (status <> 'approved' or approved_at is not null)
    and (status <> 'completed' or (approved_at is not null and completed_at is not null))
    and (status <> 'rejected' or rejected_at is not null)
    and (status <> 'expired' or expired_at is not null)
  )
);

create unique index if not exists portfolio_rebalance_runs_one_open_idx
  on public.portfolio_rebalance_runs(portfolio_id)
  where status in ('pending', 'approved');
create index if not exists portfolio_rebalance_runs_user_idx
  on public.portfolio_rebalance_runs(user_id, portfolio_id, created_at desc);
create index if not exists portfolio_rebalance_runs_expiry_idx
  on public.portfolio_rebalance_runs(expires_at)
  where status in ('pending', 'approved');

create table if not exists public.portfolio_rebalance_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  portfolio_id uuid not null,
  user_id uuid not null,
  ordinal smallint not null check (ordinal between 0 and 499),
  symbol text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.:-]{1,20}$'),
  current_quantity numeric(28, 12) not null default 0 check (current_quantity >= 0),
  reference_price numeric(28, 8) check (reference_price is null or reference_price > 0),
  price_as_of timestamptz,
  provenance jsonb,
  current_value numeric(28, 8) not null check (current_value >= 0),
  current_pct numeric(12, 6) not null,
  target_value numeric(28, 8) not null check (target_value >= 0),
  target_pct numeric(12, 6) not null check (target_pct >= 0 and target_pct <= 100),
  drift_pct numeric(12, 6) not null,
  action text not null check (action in ('buy', 'sell', 'hold')),
  trade_value numeric(28, 8) not null check (trade_value >= 0),
  estimated_quantity numeric(28, 12) check (estimated_quantity is null or estimated_quantity > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique(run_id, symbol),
  unique(id, run_id, user_id, portfolio_id),
  foreign key(run_id, user_id, portfolio_id)
    references public.portfolio_rebalance_runs(id, user_id, portfolio_id) on delete cascade,
  constraint portfolio_rebalance_items_trade_shape_check check (
    (action = 'hold' and trade_value = 0)
    or (
      action in ('buy', 'sell') and symbol <> 'CASH' and trade_value > 0
      and reference_price is not null and price_as_of is not null
      and provenance is not null and jsonb_typeof(provenance) = 'object'
      and estimated_quantity is not null
    )
  )
);
create index if not exists portfolio_rebalance_items_run_idx
  on public.portfolio_rebalance_items(run_id, ordinal);

create unique index if not exists portfolio_transactions_rebalance_link_idx
  on public.portfolio_transactions(id, user_id, portfolio_id);

create table if not exists public.portfolio_rebalance_fills (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  run_id uuid not null,
  portfolio_id uuid not null,
  user_id uuid not null,
  transaction_id uuid not null unique,
  actual_quantity numeric(28, 12) not null check (actual_quantity > 0),
  actual_price numeric(28, 8) not null check (actual_price > 0),
  actual_fees numeric(28, 8) not null default 0 check (actual_fees >= 0),
  actual_notional numeric(28, 8) not null check (actual_notional > 0),
  executed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique(item_id),
  foreign key(item_id, run_id, user_id, portfolio_id)
    references public.portfolio_rebalance_items(id, run_id, user_id, portfolio_id) on delete cascade,
  foreign key(transaction_id, user_id, portfolio_id)
    references public.portfolio_transactions(id, user_id, portfolio_id)
);
create index if not exists portfolio_rebalance_fills_run_idx
  on public.portfolio_rebalance_fills(run_id, executed_at);

create table if not exists public.portfolio_rebalance_events (
  id bigint generated by default as identity primary key,
  run_id uuid not null,
  portfolio_id uuid not null,
  user_id uuid not null,
  event text not null check (event in ('created', 'approved', 'completed', 'rejected', 'expired', 'execution_reversed')),
  from_status text check (from_status is null or from_status in ('pending', 'approved', 'completed', 'rejected', 'expired')),
  to_status text not null check (to_status in ('pending', 'approved', 'completed', 'rejected', 'expired')),
  actor text not null check (actor in ('user', 'system')),
  reason text check (reason is null or char_length(reason) <= 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  idempotency_key text check (idempotency_key is null or (char_length(idempotency_key) between 8 and 128 and idempotency_key ~ '^[A-Za-z0-9._:-]+$')),
  request_hash text check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key(run_id, user_id, portfolio_id)
    references public.portfolio_rebalance_runs(id, user_id, portfolio_id) on delete cascade
);
create unique index if not exists portfolio_rebalance_events_idempotency_idx
  on public.portfolio_rebalance_events(user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists portfolio_rebalance_events_run_idx
  on public.portfolio_rebalance_events(run_id, created_at, id);

create table if not exists public.portfolio_rebalance_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  portfolio_id uuid not null,
  user_id uuid not null,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'disabled')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(run_id, channel),
  foreign key(run_id, user_id, portfolio_id)
    references public.portfolio_rebalance_runs(id, user_id, portfolio_id) on delete cascade
);
create index if not exists portfolio_rebalance_deliveries_due_idx
  on public.portfolio_rebalance_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.portfolio_rebalance_runs enable row level security;
alter table public.portfolio_rebalance_items enable row level security;
alter table public.portfolio_rebalance_fills enable row level security;
alter table public.portfolio_rebalance_events enable row level security;
alter table public.portfolio_rebalance_deliveries enable row level security;

drop policy if exists portfolio_rebalance_runs_select_own on public.portfolio_rebalance_runs;
create policy portfolio_rebalance_runs_select_own on public.portfolio_rebalance_runs for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists portfolio_rebalance_items_select_own on public.portfolio_rebalance_items;
create policy portfolio_rebalance_items_select_own on public.portfolio_rebalance_items for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists portfolio_rebalance_fills_select_own on public.portfolio_rebalance_fills;
create policy portfolio_rebalance_fills_select_own on public.portfolio_rebalance_fills for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists portfolio_rebalance_events_select_own on public.portfolio_rebalance_events;
create policy portfolio_rebalance_events_select_own on public.portfolio_rebalance_events for select to authenticated
  using (auth.uid() = user_id);

grant select on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events to authenticated;
revoke all on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events,
  public.portfolio_rebalance_deliveries from anon;
revoke insert, update, delete on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events,
  public.portfolio_rebalance_deliveries from authenticated;
revoke insert, update, delete on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events from service_role;
revoke all on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events from service_role;
revoke all on public.portfolio_rebalance_deliveries from service_role;
grant select on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills, public.portfolio_rebalance_events,
  public.portfolio_rebalance_deliveries to service_role;
grant update(status, attempts, next_attempt_at, sent_at, last_error, updated_at)
  on public.portfolio_rebalance_deliveries to service_role;

create or replace function public.mark_portfolio_rebalance_scan_attempt(
  p_user_id uuid,
  p_portfolio_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.portfolio_allocation_policies
  set last_rebalance_scan_at = timezone('utc', now())
  where user_id = p_user_id and portfolio_id = p_portfolio_id;
$$;
revoke all on function public.mark_portfolio_rebalance_scan_attempt(uuid, uuid) from public;
grant execute on function public.mark_portfolio_rebalance_scan_attempt(uuid, uuid) to service_role;

create or replace function public.expire_portfolio_rebalance_runs(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  expired_count integer := 0;
begin
  for target in
    select id, portfolio_id, user_id, status
    from public.portfolio_rebalance_runs
    where status in ('pending', 'approved') and expires_at <= timezone('utc', now())
    order by expires_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
  loop
    update public.portfolio_rebalance_runs set
      status = 'expired', expired_at = timezone('utc', now()),
      terminal_reason = 'Plan validity window expired', updated_at = timezone('utc', now())
    where id = target.id;
    insert into public.portfolio_rebalance_events(
      run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
    ) values (
      target.id, target.portfolio_id, target.user_id, 'expired', target.status, 'expired', 'system',
      'Plan validity window expired'
    );
    update public.portfolio_rebalance_deliveries set
      status = 'disabled', last_error = 'Run expired before delivery', updated_at = timezone('utc', now())
    where run_id = target.id and status in ('pending', 'retry', 'processing');
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.expire_portfolio_rebalance_runs(integer) from public;
grant execute on function public.expire_portfolio_rebalance_runs(integer) to service_role;

create or replace function public.create_portfolio_rebalance_run(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_source text,
  p_plan_hash text,
  p_policy_updated_at timestamptz,
  p_portfolio_updated_at timestamptz,
  p_valuation_as_of timestamptz,
  p_valuation_quality text,
  p_total_value numeric,
  p_cash_balance numeric,
  p_drift_threshold_pct numeric,
  p_min_trade_value numeric,
  p_max_drift_pct numeric,
  p_estimated_cash_after numeric,
  p_expires_at timestamptz,
  p_items jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owned public.portfolios%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing_event public.portfolio_rebalance_events%rowtype;
  open_run public.portfolio_rebalance_runs%rowtype;
  inserted_run public.portfolio_rebalance_runs%rowtype;
  item jsonb;
  item_count integer;
  ordinal_value integer := 0;
  max_item public.portfolio_rebalance_items%rowtype;
  delivery_payload jsonb;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_plan_hash is null or p_plan_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request or plan hash' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing_event from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if existing_event.request_hash is distinct from p_request_hash or existing_event.event <> 'created' then
      raise exception 'idempotency key reused with different request' using errcode = '22023';
    end if;
    return jsonb_build_object('runId', existing_event.run_id, 'created', false);
  end if;

  -- Serialize every rebalance mutation for one portfolio before taking row locks.
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || p_portfolio_id::text, 0));

  select * into owned from public.portfolios
  where id = p_portfolio_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception 'active portfolio not found' using errcode = 'P0002'; end if;
  select * into policy from public.portfolio_allocation_policies
  where portfolio_id = p_portfolio_id and user_id = p_user_id
  for update;
  if not found then raise exception 'allocation policy not found' using errcode = 'P0002'; end if;
  if owned.updated_at is distinct from p_portfolio_updated_at
    or policy.updated_at is distinct from p_policy_updated_at then
    raise exception 'portfolio or policy changed while plan was generated' using errcode = '40001';
  end if;
  if p_source not in ('manual', 'scheduled') or p_valuation_quality <> 'verified'
    or p_total_value <= 0 or p_cash_balance < 0 or p_estimated_cash_after < 0
    or p_max_drift_pct < p_drift_threshold_pct
    or p_drift_threshold_pct <> policy.drift_threshold_pct
    or p_min_trade_value <> policy.min_trade_value
    or p_expires_at <= timezone('utc', now())
    or p_valuation_as_of > timezone('utc', now()) + interval '5 minutes'
    or p_valuation_as_of < timezone('utc', now()) - interval '96 hours' then
    raise exception 'rebalance plan is not safe to persist' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 500 then raise exception 'invalid rebalance item count' using errcode = '22023'; end if;

  select * into open_run from public.portfolio_rebalance_runs
  where portfolio_id = p_portfolio_id and status in ('pending', 'approved')
  order by created_at desc limit 1
  for update;
  if found then
    if open_run.expires_at <= timezone('utc', now())
      or open_run.policy_updated_at is distinct from policy.updated_at
      or open_run.portfolio_updated_at is distinct from owned.updated_at then
      update public.portfolio_rebalance_runs set
        status = 'expired', expired_at = timezone('utc', now()),
        terminal_reason = case
          when open_run.expires_at <= timezone('utc', now()) then 'Plan validity window expired'
          else 'Portfolio or allocation policy changed'
        end,
        updated_at = timezone('utc', now())
      where id = open_run.id;
      insert into public.portfolio_rebalance_events(
        run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
      ) values (
        open_run.id, open_run.portfolio_id, open_run.user_id, 'expired', open_run.status, 'expired', 'system',
        case
          when open_run.expires_at <= timezone('utc', now()) then 'Plan validity window expired'
          else 'Portfolio or allocation policy changed'
        end
      );
      update public.portfolio_rebalance_deliveries set
        status = 'disabled', last_error = 'Run is no longer pending review', updated_at = timezone('utc', now())
      where run_id = open_run.id and status in ('pending', 'retry', 'processing');
    else
      update public.portfolio_allocation_policies set last_rebalance_scan_at = timezone('utc', now())
      where portfolio_id = p_portfolio_id;
      return jsonb_build_object('runId', open_run.id, 'created', false);
    end if;
  end if;

  insert into public.portfolio_rebalance_runs(
    portfolio_id, user_id, source, plan_hash, policy_updated_at, portfolio_updated_at,
    policy_snapshot, valuation_as_of, valuation_quality, total_value, cash_balance,
    drift_threshold_pct, min_trade_value, max_drift_pct, estimated_cash_after, expires_at
  ) values (
    p_portfolio_id, p_user_id, p_source, p_plan_hash, p_policy_updated_at, p_portfolio_updated_at,
    jsonb_build_object(
      'driftThresholdPct', policy.drift_threshold_pct,
      'minTradeValue', policy.min_trade_value,
      'emailEnabled', policy.rebalance_email_enabled,
      'pushEnabled', policy.rebalance_push_enabled
    ),
    p_valuation_as_of, p_valuation_quality, p_total_value, p_cash_balance,
    p_drift_threshold_pct, p_min_trade_value, p_max_drift_pct, p_estimated_cash_after, p_expires_at
  ) returning * into inserted_run;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or upper(trim(coalesce(item->>'symbol', ''))) !~ '^[A-Z0-9.:-]{1,20}$'
      or coalesce(item->>'action', '') not in ('buy', 'sell', 'hold')
      or (item->>'currentQuantity')::numeric < 0
      or (item->>'currentValue')::numeric < 0
      or (item->>'targetValue')::numeric < 0
      or (item->>'targetPct')::numeric < 0 or (item->>'targetPct')::numeric > 100
      or (item->>'tradeValue')::numeric < 0 then
      raise exception 'invalid rebalance item' using errcode = '22023';
    end if;
    if item->>'action' in ('buy', 'sell') and (
      upper(trim(item->>'symbol')) = 'CASH'
      or coalesce((item->>'tradeValue')::numeric, 0) < p_min_trade_value
      or coalesce((item->>'referencePrice')::numeric, 0) <= 0
      or coalesce((item->>'estimatedQuantity')::numeric, 0) <= 0
      or item->>'priceAsOf' is null
      or (item->>'priceAsOf')::timestamptz > timezone('utc', now()) + interval '5 minutes'
      or (item->>'priceAsOf')::timestamptz < timezone('utc', now()) - interval '96 hours'
      or item->'provenance' is null
      or jsonb_typeof(item->'provenance') <> 'object'
    ) then
      raise exception 'unsafe actionable rebalance item' using errcode = '22023';
    end if;
    insert into public.portfolio_rebalance_items(
      run_id, portfolio_id, user_id, ordinal, symbol, current_quantity,
      reference_price, price_as_of, provenance, current_value, current_pct,
      target_value, target_pct, drift_pct, action, trade_value, estimated_quantity
    ) values (
      inserted_run.id, p_portfolio_id, p_user_id, ordinal_value, upper(trim(item->>'symbol')),
      (item->>'currentQuantity')::numeric,
      case when item->>'referencePrice' is null then null else (item->>'referencePrice')::numeric end,
      case when item->>'priceAsOf' is null then null else (item->>'priceAsOf')::timestamptz end,
      item->'provenance', (item->>'currentValue')::numeric, (item->>'currentPct')::numeric,
      (item->>'targetValue')::numeric, (item->>'targetPct')::numeric, (item->>'driftPct')::numeric,
      item->>'action', (item->>'tradeValue')::numeric,
      case when item->>'estimatedQuantity' is null then null else (item->>'estimatedQuantity')::numeric end
    );
    ordinal_value := ordinal_value + 1;
  end loop;
  if not exists (
    select 1 from public.portfolio_rebalance_items where run_id = inserted_run.id and action in ('buy', 'sell')
  ) then raise exception 'rebalance plan has no actionable orders' using errcode = '22023'; end if;

  insert into public.portfolio_rebalance_events(
    run_id, portfolio_id, user_id, event, to_status, actor, details, idempotency_key, request_hash
  ) values (
    inserted_run.id, p_portfolio_id, p_user_id, 'created', 'pending',
    case when p_source = 'scheduled' then 'system' else 'user' end,
    jsonb_build_object('source', p_source, 'planHash', p_plan_hash), p_idempotency_key, p_request_hash
  );

  if p_source = 'scheduled' then
    select * into max_item from public.portfolio_rebalance_items
    where run_id = inserted_run.id and symbol <> 'CASH'
    order by abs(drift_pct) desc, symbol limit 1;
    delivery_payload := jsonb_build_object(
      'runId', inserted_run.id,
      'portfolioId', p_portfolio_id,
      'symbol', max_item.symbol,
      'driftPct', max_item.drift_pct,
      'targetPct', max_item.target_pct,
      'createdAt', inserted_run.created_at
    );
    if policy.rebalance_email_enabled then
      insert into public.portfolio_rebalance_deliveries(run_id, portfolio_id, user_id, channel, payload)
      values (inserted_run.id, p_portfolio_id, p_user_id, 'email', delivery_payload);
    end if;
    if policy.rebalance_push_enabled then
      insert into public.portfolio_rebalance_deliveries(run_id, portfolio_id, user_id, channel, payload)
      values (inserted_run.id, p_portfolio_id, p_user_id, 'push', delivery_payload);
    end if;
  end if;
  update public.portfolio_allocation_policies set last_rebalance_scan_at = timezone('utc', now())
  where portfolio_id = p_portfolio_id;
  return jsonb_build_object('runId', inserted_run.id, 'created', true);
end;
$$;
revoke all on function public.create_portfolio_rebalance_run(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text
) from public;
grant execute on function public.create_portfolio_rebalance_run(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text
) to service_role;

create or replace function public.transition_portfolio_rebalance_run(
  p_user_id uuid,
  p_run_id uuid,
  p_action text,
  p_reason text,
  p_details jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.portfolio_rebalance_runs%rowtype;
  owned public.portfolios%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing public.portfolio_rebalance_events%rowtype;
  next_status text;
  actionable_count integer;
  price_count integer;
  distinct_price_count integer;
  target_portfolio_id uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash is distinct from p_request_hash or existing.event <> p_action then
      raise exception 'idempotency key reused with different request' using errcode = '22023';
    end if;
    return existing.run_id;
  end if;
  select portfolio_id into target_portfolio_id from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if target_portfolio_id is null then raise exception 'rebalance run not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || target_portfolio_id::text, 0));
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id for update;
  if not found then raise exception 'rebalance run not found' using errcode = 'P0002'; end if;
  if p_action = 'approved' then
    if run.status <> 'pending' then raise exception 'only pending runs can be approved' using errcode = 'P0001'; end if;
    if run.expires_at <= timezone('utc', now()) then raise exception 'rebalance run expired' using errcode = 'P0001'; end if;
    select * into owned from public.portfolios
    where id = run.portfolio_id and user_id = p_user_id and status = 'active' for update;
    select * into policy from public.portfolio_allocation_policies
    where portfolio_id = run.portfolio_id and user_id = p_user_id for update;
    if owned.updated_at is distinct from run.portfolio_updated_at
      or policy.updated_at is distinct from run.policy_updated_at then
      raise exception 'portfolio or policy changed; generate a new plan' using errcode = '40001';
    end if;
    if jsonb_typeof(p_details) <> 'object' or jsonb_typeof(p_details->'prices') <> 'array' then
      raise exception 'approval price snapshot is required' using errcode = '22023';
    end if;
    select count(*) into actionable_count from public.portfolio_rebalance_items
    where run_id = run.id and action in ('buy', 'sell');
    if jsonb_array_length(p_details->'prices') <> actionable_count then
      raise exception 'approval price snapshot has an invalid item count' using errcode = '22023';
    end if;
    select count(*), count(distinct upper(trim(value->>'symbol')))
      into price_count, distinct_price_count
    from jsonb_array_elements(p_details->'prices')
    where jsonb_typeof(value) = 'object'
      and upper(trim(coalesce(value->>'symbol', ''))) ~ '^[A-Z0-9.:-]{1,20}$'
      and coalesce((value->>'price')::numeric, 0) > 0
      and (value->>'priceAsOf')::timestamptz <= timezone('utc', now()) + interval '5 minutes'
      and (value->>'priceAsOf')::timestamptz >= timezone('utc', now()) - interval '96 hours'
      and exists (
        select 1 from public.portfolio_rebalance_items i
        where i.run_id = run.id and i.action in ('buy', 'sell')
          and i.symbol = upper(trim(value->>'symbol'))
          and abs((value->>'price')::numeric / i.reference_price - 1) <= 0.03
      );
    if price_count <> actionable_count or distinct_price_count <> actionable_count then
      raise exception 'approval price snapshot does not cover proposed orders' using errcode = '22023';
    end if;
    next_status := 'approved';
  elsif p_action = 'rejected' then
    if run.status not in ('pending', 'approved') then raise exception 'run cannot be rejected' using errcode = 'P0001'; end if;
    next_status := 'rejected';
  elsif p_action = 'expired' then
    if run.status not in ('pending', 'approved') then raise exception 'run cannot be expired' using errcode = 'P0001'; end if;
    next_status := 'expired';
  else
    raise exception 'invalid transition action' using errcode = '22023';
  end if;
  if p_action in ('rejected', 'expired') and char_length(trim(coalesce(p_reason, ''))) < 1 then
    raise exception 'transition reason is required' using errcode = '22023';
  end if;

  update public.portfolio_rebalance_runs set
    status = next_status,
    approved_at = case when next_status = 'approved' then timezone('utc', now()) else approved_at end,
    rejected_at = case when next_status = 'rejected' then timezone('utc', now()) else rejected_at end,
    expired_at = case when next_status = 'expired' then timezone('utc', now()) else expired_at end,
    terminal_reason = case when next_status in ('rejected', 'expired') then left(trim(p_reason), 500) else terminal_reason end,
    updated_at = timezone('utc', now())
  where id = run.id;
  insert into public.portfolio_rebalance_events(
    run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason,
    details, idempotency_key, request_hash
  ) values (
    run.id, run.portfolio_id, p_user_id, p_action, run.status, next_status, 'user',
    nullif(left(trim(coalesce(p_reason, '')), 500), ''), coalesce(p_details, '{}'::jsonb),
    p_idempotency_key, p_request_hash
  );
  if next_status <> 'pending' then
    update public.portfolio_rebalance_deliveries set
      status = 'disabled', last_error = 'Run is no longer pending review', updated_at = timezone('utc', now())
    where run_id = run.id and status in ('pending', 'retry', 'processing');
  end if;
  return run.id;
end;
$$;
revoke all on function public.transition_portfolio_rebalance_run(uuid, uuid, text, text, jsonb, text, text) from public;
grant execute on function public.transition_portfolio_rebalance_run(uuid, uuid, text, text, jsonb, text, text) to service_role;

create or replace function public.complete_portfolio_rebalance_run(
  p_user_id uuid,
  p_run_id uuid,
  p_fills jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.portfolio_rebalance_runs%rowtype;
  owned public.portfolios%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing public.portfolio_rebalance_events%rowtype;
  fill_count integer;
  expected_count integer;
  unique_count integer;
  fill_record record;
  inserted_transaction public.portfolio_transactions%rowtype;
  approval_event public.portfolio_rebalance_events%rowtype;
  approval_price numeric;
  fill_quantity numeric(28, 12);
  fill_price numeric(28, 8);
  fill_fees numeric(28, 8);
  fill_trade_at timestamptz;
  derived_key text;
  target_portfolio_id uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash is distinct from p_request_hash or existing.event <> 'completed' then
      raise exception 'idempotency key reused with different request' using errcode = '22023';
    end if;
    return existing.run_id;
  end if;
  select portfolio_id into target_portfolio_id from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if target_portfolio_id is null then raise exception 'rebalance run not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || target_portfolio_id::text, 0));
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id for update;
  if not found then raise exception 'rebalance run not found' using errcode = 'P0002'; end if;
  if run.status <> 'approved' then raise exception 'only approved runs can be completed' using errcode = 'P0001'; end if;
  if run.expires_at <= timezone('utc', now()) then raise exception 'rebalance run expired' using errcode = 'P0001'; end if;
  select * into owned from public.portfolios
  where id = run.portfolio_id and user_id = p_user_id and status = 'active' for update;
  select * into policy from public.portfolio_allocation_policies
  where portfolio_id = run.portfolio_id and user_id = p_user_id for update;
  if owned.updated_at is distinct from run.portfolio_updated_at
    or policy.updated_at is distinct from run.policy_updated_at then
    raise exception 'portfolio or policy changed; approval is no longer valid' using errcode = '40001';
  end if;
  select * into approval_event from public.portfolio_rebalance_events
  where run_id = run.id and event = 'approved'
  order by id desc limit 1;
  if not found or jsonb_typeof(approval_event.details->'prices') <> 'array' then
    raise exception 'approval price snapshot is missing' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_fills) <> 'array' then raise exception 'fills must be an array' using errcode = '22023'; end if;
  fill_count := jsonb_array_length(p_fills);
  select count(*) into expected_count from public.portfolio_rebalance_items
  where run_id = run.id and action in ('buy', 'sell');
  select count(distinct value->>'itemId') into unique_count from jsonb_array_elements(p_fills);
  if fill_count <> expected_count or unique_count <> expected_count then
    raise exception 'exactly one fill is required for every proposed order' using errcode = '22023';
  end if;

  for fill_record in
    select i.*, value as fill
    from jsonb_array_elements(p_fills) f(value)
    join public.portfolio_rebalance_items i
      on i.id = (value->>'itemId')::uuid and i.run_id = run.id and i.action in ('buy', 'sell')
    order by (value->>'tradeAt')::timestamptz,
      case when i.action = 'sell' then 0 else 1 end, i.ordinal
  loop
    fill_quantity := round((fill_record.fill->>'quantity')::numeric, 12);
    fill_price := round((fill_record.fill->>'price')::numeric, 8);
    fill_fees := round((fill_record.fill->>'fees')::numeric, 8);
    fill_trade_at := (fill_record.fill->>'tradeAt')::timestamptz;
    select (value->>'price')::numeric into approval_price
    from jsonb_array_elements(approval_event.details->'prices')
    where upper(trim(value->>'symbol')) = fill_record.symbol
    limit 1;
    if coalesce(fill_quantity, 0) <= 0
      or coalesce(fill_price, 0) <= 0
      or coalesce(fill_fees, 0) < 0
      or fill_trade_at < run.approved_at
      or fill_trade_at > timezone('utc', now()) + interval '5 minutes'
      or fill_quantity * fill_price < run.min_trade_value
      or approval_price is null
      or abs(fill_price / fill_record.reference_price - 1) > 0.03
      or abs(fill_price / approval_price - 1) > 0.03 then
      raise exception 'fill failed price, time or minimum-order safety checks' using errcode = '22023';
    end if;
    derived_key := 'p7:' || replace(run.id::text, '-', '') || ':' || replace(fill_record.id::text, '-', '');
    select * into inserted_transaction from public.append_portfolio_transaction(
      p_user_id,
      run.portfolio_id,
      derived_key,
      fill_record.action,
      fill_record.symbol,
      fill_quantity,
      fill_price,
      0,
      fill_fees,
      fill_trade_at,
      'Approved rebalance ' || run.id::text
    );
    if inserted_transaction.portfolio_id is distinct from run.portfolio_id
      or inserted_transaction.user_id is distinct from p_user_id
      or inserted_transaction.kind is distinct from fill_record.action
      or inserted_transaction.symbol is distinct from fill_record.symbol
      or inserted_transaction.quantity is distinct from fill_quantity
      or inserted_transaction.price is distinct from fill_price
      or inserted_transaction.fees is distinct from fill_fees
      or inserted_transaction.trade_at is distinct from fill_trade_at then
      raise exception 'derived ledger idempotency key collision' using errcode = '22023';
    end if;
    insert into public.portfolio_rebalance_fills(
      item_id, run_id, portfolio_id, user_id, transaction_id,
      actual_quantity, actual_price, actual_fees, actual_notional, executed_at
    ) values (
      fill_record.id, run.id, run.portfolio_id, p_user_id, inserted_transaction.id,
      fill_quantity, fill_price, fill_fees, fill_quantity * fill_price, fill_trade_at
    );
  end loop;
  if (select count(*) from public.portfolio_rebalance_fills where run_id = run.id) <> expected_count then
    raise exception 'fill mapping is incomplete' using errcode = '22023';
  end if;
  update public.portfolio_rebalance_runs set
    status = 'completed', completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = run.id;
  insert into public.portfolio_rebalance_events(
    run_id, portfolio_id, user_id, event, from_status, to_status, actor,
    details, idempotency_key, request_hash
  ) values (
    run.id, run.portfolio_id, p_user_id, 'completed', 'approved', 'completed', 'user',
    jsonb_build_object('fillCount', expected_count), p_idempotency_key, p_request_hash
  );
  return run.id;
end;
$$;
revoke all on function public.complete_portfolio_rebalance_run(uuid, uuid, jsonb, text, text) from public;
grant execute on function public.complete_portfolio_rebalance_run(uuid, uuid, jsonb, text, text) to service_role;

create or replace function public.claim_due_portfolio_rebalance_deliveries(p_limit integer default 50)
returns setof public.portfolio_rebalance_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portfolio_rebalance_deliveries set
    status = 'retry', next_attempt_at = timezone('utc', now()),
    last_error = 'Recovered stale delivery lease', updated_at = timezone('utc', now())
  where status = 'processing' and updated_at < timezone('utc', now()) - interval '5 minutes';
  return query
  with due as (
    select d.id
    from public.portfolio_rebalance_deliveries d
    join public.portfolio_rebalance_runs r on r.id = d.run_id
    where d.status in ('pending', 'retry')
      and (d.next_attempt_at is null or d.next_attempt_at <= timezone('utc', now()))
      and r.status = 'pending' and r.expires_at > timezone('utc', now())
    order by coalesce(d.next_attempt_at, d.created_at), d.created_at, d.id
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 250))
  )
  update public.portfolio_rebalance_deliveries d set
    status = 'processing', attempts = d.attempts + 1, updated_at = timezone('utc', now())
  from due where d.id = due.id returning d.*;
end;
$$;
revoke all on function public.claim_due_portfolio_rebalance_deliveries(integer) from public;
grant execute on function public.claim_due_portfolio_rebalance_deliveries(integer) to service_role;

create or replace function public.retry_failed_portfolio_rebalance_deliveries(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  with candidates as (
    select d.id
    from public.portfolio_rebalance_deliveries d
    join public.portfolio_rebalance_runs r on r.id = d.run_id
    where d.status = 'failed' and r.status = 'pending' and r.expires_at > timezone('utc', now())
    order by d.updated_at, d.id
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.portfolio_rebalance_deliveries d set
    status = 'retry', next_attempt_at = timezone('utc', now()),
    last_error = coalesce(d.last_error, 'Manual retry requested'), updated_at = timezone('utc', now())
  from candidates c where d.id = c.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.retry_failed_portfolio_rebalance_deliveries(integer) from public;
grant execute on function public.retry_failed_portfolio_rebalance_deliveries(integer) to service_role;

create or replace function public.audit_rebalance_execution_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked record;
begin
  if new.kind <> 'reversal' or new.reversal_of is null then return new; end if;
  select f.run_id, f.portfolio_id, f.user_id, f.item_id
    into linked
  from public.portfolio_rebalance_fills f
  where f.transaction_id = new.reversal_of;
  if found then
    insert into public.portfolio_rebalance_events(
      run_id, portfolio_id, user_id, event, from_status, to_status, actor, details
    ) values (
      linked.run_id, linked.portfolio_id, linked.user_id, 'execution_reversed',
      'completed', 'completed', 'user',
      jsonb_build_object(
        'itemId', linked.item_id,
        'transactionId', new.reversal_of,
        'reversalTransactionId', new.id
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_rebalance_execution_reversal() from public;

drop trigger if exists portfolio_transactions_audit_rebalance_reversal on public.portfolio_transactions;
create trigger portfolio_transactions_audit_rebalance_reversal
  after insert on public.portfolio_transactions
  for each row when (new.kind = 'reversal')
  execute function public.audit_rebalance_execution_reversal();
