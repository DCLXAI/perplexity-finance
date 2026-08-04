-- Perplexity Finance v1.9.0 P8 investment goals and recurring contributions.
-- Extends the durable P7 plan workflow so contribution deposits and user-entered
-- fills are committed atomically. This migration never submits broker orders.

create table if not exists public.portfolio_goals (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_amount numeric(28, 8) not null check (target_amount > 0),
  target_date date not null,
  expected_annual_return_pct numeric(10, 6) not null default 0
    check (expected_annual_return_pct >= -50 and expected_annual_return_pct <= 50),
  contribution_amount numeric(28, 8) not null check (contribution_amount > 0),
  contribution_day smallint not null check (contribution_day between 1 and 28),
  next_contribution_date date not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  completed_at timestamptz,
  archived_at timestamptz,
  last_contribution_scan_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(id, user_id, portfolio_id),
  constraint portfolio_goals_schedule_day_check check (
    extract(day from next_contribution_date)::integer = contribution_day
  ),
  constraint portfolio_goals_status_timestamps_check check (
    (status <> 'completed' or completed_at is not null)
    and (status <> 'archived' or archived_at is not null)
  )
);

create unique index if not exists portfolio_goals_one_current_idx
  on public.portfolio_goals(portfolio_id)
  where status in ('active', 'paused');
create index if not exists portfolio_goals_user_idx
  on public.portfolio_goals(user_id, portfolio_id, created_at desc);
create index if not exists portfolio_goals_scan_idx
  on public.portfolio_goals(next_contribution_date, last_contribution_scan_at nulls first, id)
  where status = 'active';

drop trigger if exists portfolio_goals_set_updated_at on public.portfolio_goals;
create trigger portfolio_goals_set_updated_at
  before update on public.portfolio_goals
  for each row
  when (
    old.name is distinct from new.name
    or old.target_amount is distinct from new.target_amount
    or old.target_date is distinct from new.target_date
    or old.expected_annual_return_pct is distinct from new.expected_annual_return_pct
    or old.contribution_amount is distinct from new.contribution_amount
    or old.contribution_day is distinct from new.contribution_day
    or old.status is distinct from new.status
  )
  execute function public.set_updated_at();

alter table public.portfolio_goals enable row level security;
drop policy if exists portfolio_goals_select_own on public.portfolio_goals;
create policy portfolio_goals_select_own on public.portfolio_goals for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.portfolio_goals from anon, authenticated, service_role;
revoke insert, update, delete on public.portfolio_goals from authenticated, service_role;
grant select on public.portfolio_goals to authenticated, service_role;

alter table public.portfolio_rebalance_runs
  add column if not exists plan_kind text not null default 'rebalance',
  add column if not exists goal_id uuid,
  add column if not exists goal_updated_at timestamptz,
  add column if not exists scheduled_for date,
  add column if not exists contribution_amount numeric(28, 8),
  add column if not exists cash_remainder numeric(28, 8),
  add column if not exists deposit_transaction_id uuid;

-- P7 rebalances still require a positive existing valuation, while a brand-new
-- portfolio may create its first contribution plan from a zero balance.
alter table public.portfolio_rebalance_runs
  drop constraint if exists portfolio_rebalance_runs_total_value_check;
alter table public.portfolio_rebalance_runs
  add constraint portfolio_rebalance_runs_total_value_check check (
    (plan_kind = 'rebalance' and total_value > 0)
    or (plan_kind = 'contribution' and total_value >= 0)
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.portfolio_rebalance_runs'::regclass
      and conname = 'portfolio_rebalance_runs_plan_kind_check'
  ) then
    alter table public.portfolio_rebalance_runs
      add constraint portfolio_rebalance_runs_plan_kind_check
      check (plan_kind in ('rebalance', 'contribution'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.portfolio_rebalance_runs'::regclass
      and conname = 'portfolio_rebalance_runs_goal_fk'
  ) then
    alter table public.portfolio_rebalance_runs
      add constraint portfolio_rebalance_runs_goal_fk
      foreign key(goal_id, user_id, portfolio_id)
      references public.portfolio_goals(id, user_id, portfolio_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.portfolio_rebalance_runs'::regclass
      and conname = 'portfolio_rebalance_runs_deposit_fk'
  ) then
    alter table public.portfolio_rebalance_runs
      add constraint portfolio_rebalance_runs_deposit_fk
      foreign key(deposit_transaction_id, user_id, portfolio_id)
      references public.portfolio_transactions(id, user_id, portfolio_id)
      deferrable initially deferred;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.portfolio_rebalance_runs'::regclass
      and conname = 'portfolio_rebalance_runs_contribution_shape_check'
  ) then
    alter table public.portfolio_rebalance_runs
      add constraint portfolio_rebalance_runs_contribution_shape_check check (
        (
          plan_kind = 'rebalance'
          and goal_id is null and goal_updated_at is null and scheduled_for is null
          and contribution_amount is null and cash_remainder is null
          and deposit_transaction_id is null
        )
        or (
          plan_kind = 'contribution'
          and goal_id is not null and goal_updated_at is not null
          and contribution_amount > 0 and cash_remainder >= 0
          and cash_remainder <= contribution_amount
          and (
            (source = 'scheduled' and scheduled_for is not null)
            or (source = 'manual' and scheduled_for is null)
          )
          and (
            (status = 'completed' and deposit_transaction_id is not null)
            or (status <> 'completed' and deposit_transaction_id is null)
          )
        )
      );
  end if;
end;
$$;

create unique index if not exists portfolio_contribution_runs_cycle_idx
  on public.portfolio_rebalance_runs(goal_id, scheduled_for)
  where plan_kind = 'contribution' and source = 'scheduled' and scheduled_for is not null;
create unique index if not exists portfolio_contribution_deposit_idx
  on public.portfolio_rebalance_runs(deposit_transaction_id)
  where deposit_transaction_id is not null;
create index if not exists portfolio_contribution_goal_idx
  on public.portfolio_rebalance_runs(goal_id, created_at desc)
  where plan_kind = 'contribution';

create or replace function public.next_portfolio_goal_contribution_date(
  p_from date,
  p_contribution_day integer
) returns date
language sql
immutable
set search_path = public
as $$
  select (
    date_trunc('month', p_from::timestamp) + interval '1 month'
    + ((p_contribution_day - 1)::text || ' days')::interval
  )::date;
$$;
revoke all on function public.next_portfolio_goal_contribution_date(date, integer) from public;

create or replace function public.current_portfolio_goal_contribution_date(
  p_contribution_day integer
) returns date
language sql
stable
set search_path = public
as $$
  with today as (
    select timezone('utc', now())::date as value
  ), candidate as (
    select (
      date_trunc('month', value::timestamp)
      + ((p_contribution_day - 1)::text || ' days')::interval
    )::date as value, today.value as today
    from today
  )
  select case
    when candidate.value >= candidate.today then candidate.value
    else public.next_portfolio_goal_contribution_date(candidate.value, p_contribution_day)
  end
  from candidate;
$$;
revoke all on function public.current_portfolio_goal_contribution_date(integer) from public;

create or replace function public.upsert_portfolio_goal(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_name text,
  p_target_amount numeric,
  p_target_date date,
  p_expected_annual_return_pct numeric,
  p_contribution_amount numeric,
  p_contribution_day integer,
  p_expected_updated_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owned public.portfolios%rowtype;
  current_goal public.portfolio_goals%rowtype;
  stale record;
  result_id uuid;
  today date := timezone('utc', now())::date;
  next_date date;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80
    or coalesce(p_target_amount, 0) <= 0
    or p_target_date is null or p_target_date < today
    or p_expected_annual_return_pct is null
    or p_expected_annual_return_pct < -50 or p_expected_annual_return_pct > 50
    or coalesce(p_contribution_amount, 0) <= 0
    or p_contribution_day is null or p_contribution_day not between 1 and 28 then
    raise exception 'invalid portfolio goal' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || p_portfolio_id::text, 0));
  select * into owned from public.portfolios
  where id = p_portfolio_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception 'active portfolio not found' using errcode = 'P0002'; end if;

  select * into current_goal from public.portfolio_goals
  where portfolio_id = p_portfolio_id and user_id = p_user_id
    and status in ('active', 'paused')
  order by created_at desc limit 1 for update;

  if found then
    if p_expected_updated_at is null or current_goal.updated_at is distinct from p_expected_updated_at then
      raise exception 'goal version changed' using errcode = '40001';
    end if;
    next_date := case
      when current_goal.contribution_day = p_contribution_day
        and current_goal.next_contribution_date >= today
      then current_goal.next_contribution_date
      else public.current_portfolio_goal_contribution_date(p_contribution_day)
    end;
    update public.portfolio_goals set
      name = trim(p_name), target_amount = round(p_target_amount, 8), target_date = p_target_date,
      expected_annual_return_pct = round(p_expected_annual_return_pct, 6),
      contribution_amount = round(p_contribution_amount, 8), contribution_day = p_contribution_day,
      next_contribution_date = next_date, updated_at = timezone('utc', now())
    where id = current_goal.id returning id into result_id;

    for stale in
      select id, status, portfolio_id, user_id
      from public.portfolio_rebalance_runs
      where goal_id = current_goal.id and plan_kind = 'contribution'
        and status in ('pending', 'approved')
      for update
    loop
      update public.portfolio_rebalance_runs set
        status = 'expired', expired_at = timezone('utc', now()),
        terminal_reason = 'Goal changed after contribution plan generation',
        updated_at = timezone('utc', now())
      where id = stale.id;
      insert into public.portfolio_rebalance_events(
        run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
      ) values (
        stale.id, stale.portfolio_id, stale.user_id, 'expired', stale.status, 'expired', 'system',
        'Goal changed after contribution plan generation'
      );
    end loop;
  else
    if p_expected_updated_at is not null then
      raise exception 'goal not found for expected version' using errcode = 'P0002';
    end if;
    next_date := public.current_portfolio_goal_contribution_date(p_contribution_day);
    insert into public.portfolio_goals(
      portfolio_id, user_id, name, target_amount, target_date,
      expected_annual_return_pct, contribution_amount, contribution_day, next_contribution_date
    ) values (
      p_portfolio_id, p_user_id, trim(p_name), round(p_target_amount, 8), p_target_date,
      round(p_expected_annual_return_pct, 6), round(p_contribution_amount, 8),
      p_contribution_day, next_date
    ) returning id into result_id;
  end if;
  return result_id;
end;
$$;
revoke all on function public.upsert_portfolio_goal(
  uuid, uuid, text, numeric, date, numeric, numeric, integer, timestamptz
) from public;
grant execute on function public.upsert_portfolio_goal(
  uuid, uuid, text, numeric, date, numeric, numeric, integer, timestamptz
) to service_role;

create or replace function public.transition_portfolio_goal(
  p_user_id uuid,
  p_goal_id uuid,
  p_action text,
  p_expected_updated_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  goal public.portfolio_goals%rowtype;
  stale record;
  next_status text;
  today date := timezone('utc', now())::date;
begin
  select * into goal from public.portfolio_goals where id = p_goal_id and user_id = p_user_id;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || goal.portfolio_id::text, 0));
  select * into goal from public.portfolio_goals
  where id = p_goal_id and user_id = p_user_id for update;
  if goal.updated_at is distinct from p_expected_updated_at then
    raise exception 'goal version changed' using errcode = '40001';
  end if;

  if p_action = 'pause' and goal.status = 'active' then next_status := 'paused';
  elsif p_action = 'resume' and goal.status = 'paused' then next_status := 'active';
  elsif p_action = 'complete' and goal.status in ('active', 'paused') then next_status := 'completed';
  elsif p_action = 'archive' and goal.status in ('active', 'paused', 'completed') then next_status := 'archived';
  else raise exception 'invalid goal transition' using errcode = 'P0001';
  end if;

  update public.portfolio_goals set
    status = next_status,
    next_contribution_date = case
      when next_status = 'active' and next_contribution_date < today
      then public.current_portfolio_goal_contribution_date(contribution_day)
      else next_contribution_date
    end,
    archived_at = case when next_status = 'archived' then timezone('utc', now()) else archived_at end,
    completed_at = case when next_status = 'completed' then timezone('utc', now()) else completed_at end,
    updated_at = timezone('utc', now())
  where id = goal.id;

  if next_status in ('paused', 'completed', 'archived') then
    for stale in
      select id, status, portfolio_id, user_id
      from public.portfolio_rebalance_runs
      where goal_id = goal.id and plan_kind = 'contribution'
        and status in ('pending', 'approved')
      for update
    loop
      update public.portfolio_rebalance_runs set
        status = 'expired', expired_at = timezone('utc', now()),
        terminal_reason = case
          when next_status = 'paused' then 'Goal paused before contribution completion'
          when next_status = 'completed' then 'Goal completed before contribution completion'
          else 'Goal archived before contribution completion' end,
        updated_at = timezone('utc', now())
      where id = stale.id;
      insert into public.portfolio_rebalance_events(
        run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
      ) values (
        stale.id, stale.portfolio_id, stale.user_id, 'expired', stale.status, 'expired', 'user',
        case
          when next_status = 'paused' then 'Goal paused before contribution completion'
          when next_status = 'completed' then 'Goal completed before contribution completion'
          else 'Goal archived before contribution completion' end
      );
    end loop;
  end if;
  return goal.id;
end;
$$;
revoke all on function public.transition_portfolio_goal(uuid, uuid, text, timestamptz) from public;
grant execute on function public.transition_portfolio_goal(uuid, uuid, text, timestamptz) to service_role;

create or replace function public.mark_portfolio_goal_scan_attempt(
  p_user_id uuid,
  p_goal_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.portfolio_goals set last_contribution_scan_at = timezone('utc', now())
  where id = p_goal_id and user_id = p_user_id and status = 'active';
$$;
revoke all on function public.mark_portfolio_goal_scan_attempt(uuid, uuid) from public;
grant execute on function public.mark_portfolio_goal_scan_attempt(uuid, uuid) to service_role;

-- Preserve the P7 RPC names while isolating their idempotency and mutations to
-- rebalance plans. Both plan kinds share the existing one-open-plan mutex.
do $$
begin
  if to_regprocedure(
    'public.create_portfolio_rebalance_run_p7(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,text,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,text,text)'
  ) is null then
    alter function public.create_portfolio_rebalance_run(
      uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
      numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text
    ) rename to create_portfolio_rebalance_run_p7;
  end if;
  if to_regprocedure(
    'public.transition_portfolio_rebalance_run_p7(uuid,uuid,text,text,jsonb,text,text)'
  ) is null then
    alter function public.transition_portfolio_rebalance_run(
      uuid, uuid, text, text, jsonb, text, text
    ) rename to transition_portfolio_rebalance_run_p7;
  end if;
  if to_regprocedure(
    'public.complete_portfolio_rebalance_run_p7(uuid,uuid,jsonb,text,text)'
  ) is null then
    alter function public.complete_portfolio_rebalance_run(
      uuid, uuid, jsonb, text, text
    ) rename to complete_portfolio_rebalance_run_p7;
  end if;
end;
$$;

revoke all on function public.create_portfolio_rebalance_run_p7(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.transition_portfolio_rebalance_run_p7(
  uuid, uuid, text, text, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_portfolio_rebalance_run_p7(
  uuid, uuid, jsonb, text, text
) from public, anon, authenticated, service_role;

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
  existing_event public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  open_run public.portfolio_rebalance_runs%rowtype;
  open_is_stale boolean;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing_event from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing_event.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'rebalance'
      or existing_event.request_hash is distinct from p_request_hash
      or existing_event.event <> 'created' then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return jsonb_build_object('runId', existing_event.run_id, 'created', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || p_portfolio_id::text, 0));
  select * into open_run from public.portfolio_rebalance_runs
  where portfolio_id = p_portfolio_id and status in ('pending', 'approved')
  order by created_at desc limit 1 for update;
  if found and open_run.plan_kind = 'contribution' then
    select (
      open_run.expires_at <= timezone('utc', now())
      or not exists (
        select 1 from public.portfolios p
        where p.id = open_run.portfolio_id and p.user_id = open_run.user_id
          and p.status = 'active' and p.updated_at = open_run.portfolio_updated_at
      )
      or not exists (
        select 1 from public.portfolio_allocation_policies p
        where p.portfolio_id = open_run.portfolio_id and p.user_id = open_run.user_id
          and p.updated_at = open_run.policy_updated_at
      )
      or not exists (
        select 1 from public.portfolio_goals g
        where g.id = open_run.goal_id and g.user_id = open_run.user_id
          and g.portfolio_id = open_run.portfolio_id and g.status = 'active'
          and g.updated_at = open_run.goal_updated_at
      )
    ) into open_is_stale;
    if open_is_stale then
      update public.portfolio_rebalance_runs set
        status = 'expired', expired_at = timezone('utc', now()),
        terminal_reason = 'Contribution plan became stale before a rebalance was generated',
        updated_at = timezone('utc', now())
      where id = open_run.id;
      insert into public.portfolio_rebalance_events(
        run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
      ) values (
        open_run.id, open_run.portfolio_id, open_run.user_id, 'expired', open_run.status,
        'expired', 'system', 'Contribution plan became stale before a rebalance was generated'
      );
      update public.portfolio_rebalance_deliveries set
        status = 'disabled', last_error = 'Run is no longer pending review',
        updated_at = timezone('utc', now())
      where run_id = open_run.id and status in ('pending', 'retry', 'processing');
    else
      raise exception 'another investment plan is awaiting review or completion' using errcode = 'P0001';
    end if;
  end if;

  return public.create_portfolio_rebalance_run_p7(
    p_user_id, p_portfolio_id, p_source, p_plan_hash, p_policy_updated_at,
    p_portfolio_updated_at, p_valuation_as_of, p_valuation_quality, p_total_value,
    p_cash_balance, p_drift_threshold_pct, p_min_trade_value, p_max_drift_pct,
    p_estimated_cash_after, p_expires_at, p_items, p_idempotency_key, p_request_hash
  );
end;
$$;
revoke all on function public.create_portfolio_rebalance_run(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text
) from public, anon, authenticated;
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
  existing_event public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  run_kind text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing_event from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing_event.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'rebalance'
      or existing_event.request_hash is distinct from p_request_hash
      or existing_event.event <> p_action then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return existing_event.run_id;
  end if;
  select plan_kind into run_kind from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if run_kind is distinct from 'rebalance' then
    raise exception 'rebalance run not found' using errcode = 'P0002';
  end if;
  return public.transition_portfolio_rebalance_run_p7(
    p_user_id, p_run_id, p_action, p_reason, p_details, p_idempotency_key, p_request_hash
  );
end;
$$;
revoke all on function public.transition_portfolio_rebalance_run(
  uuid, uuid, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.transition_portfolio_rebalance_run(
  uuid, uuid, text, text, jsonb, text, text
) to service_role;

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
  existing_event public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  run_kind text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing_event from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing_event.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'rebalance'
      or existing_event.request_hash is distinct from p_request_hash
      or existing_event.event <> 'completed' then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return existing_event.run_id;
  end if;
  select plan_kind into run_kind from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if run_kind is distinct from 'rebalance' then
    raise exception 'rebalance run not found' using errcode = 'P0002';
  end if;
  return public.complete_portfolio_rebalance_run_p7(
    p_user_id, p_run_id, p_fills, p_idempotency_key, p_request_hash
  );
end;
$$;
revoke all on function public.complete_portfolio_rebalance_run(
  uuid, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.complete_portfolio_rebalance_run(
  uuid, uuid, jsonb, text, text
) to service_role;

create or replace function public.create_portfolio_contribution_run(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_goal_id uuid,
  p_source text,
  p_scheduled_for date,
  p_plan_hash text,
  p_goal_updated_at timestamptz,
  p_policy_updated_at timestamptz,
  p_portfolio_updated_at timestamptz,
  p_valuation_as_of timestamptz,
  p_valuation_quality text,
  p_total_value numeric,
  p_cash_balance numeric,
  p_contribution_amount numeric,
  p_min_trade_value numeric,
  p_max_drift_pct numeric,
  p_cash_remainder numeric,
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
  goal public.portfolio_goals%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing_event public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  duplicate_run public.portfolio_rebalance_runs%rowtype;
  open_run public.portfolio_rebalance_runs%rowtype;
  inserted_run public.portfolio_rebalance_runs%rowtype;
  item jsonb;
  item_count integer;
  distinct_count integer;
  target_count integer;
  ordinal_value integer := 0;
  allocated_total numeric := 0;
  stored_max_drift numeric;
  open_is_stale boolean;
  snapshot_targets jsonb;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_plan_hash is null or p_plan_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency, request or plan hash' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing_event from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing_event.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'contribution'
      or existing_event.request_hash is distinct from p_request_hash
      or existing_event.event <> 'created' then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return jsonb_build_object('runId', existing_event.run_id, 'created', false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || p_portfolio_id::text, 0));

  -- A scheduled cycle is unique independently of the HTTP idempotency key. This
  -- check intentionally precedes version/cursor validation so retries still find
  -- the immutable plan after next_contribution_date advances.
  if p_source = 'scheduled' and p_scheduled_for is not null then
    select * into duplicate_run from public.portfolio_rebalance_runs
    where user_id = p_user_id and portfolio_id = p_portfolio_id
      and goal_id = p_goal_id and plan_kind = 'contribution'
      and source = 'scheduled' and scheduled_for = p_scheduled_for
    limit 1;
    if found then
      return jsonb_build_object('runId', duplicate_run.id, 'created', false);
    end if;
  end if;

  select * into owned from public.portfolios
  where id = p_portfolio_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception 'active portfolio not found' using errcode = 'P0002'; end if;
  select * into goal from public.portfolio_goals
  where id = p_goal_id and portfolio_id = p_portfolio_id and user_id = p_user_id
    and status = 'active'
  for update;
  if not found then raise exception 'active portfolio goal not found' using errcode = 'P0002'; end if;
  select * into policy from public.portfolio_allocation_policies
  where portfolio_id = p_portfolio_id and user_id = p_user_id
  for update;
  if not found then raise exception 'allocation policy not found' using errcode = 'P0002'; end if;

  if owned.updated_at is distinct from p_portfolio_updated_at
    or goal.updated_at is distinct from p_goal_updated_at
    or policy.updated_at is distinct from p_policy_updated_at then
    raise exception 'portfolio, goal or policy changed while plan was generated' using errcode = '40001';
  end if;
  if p_source is null or p_source not in ('manual', 'scheduled')
    or (p_source = 'manual' and p_scheduled_for is not null)
    or (p_source = 'scheduled' and (
      p_scheduled_for is null or p_scheduled_for <> goal.next_contribution_date
      or p_scheduled_for > goal.target_date
    ))
    or goal.target_date < timezone('utc', now())::date
    or p_valuation_quality is distinct from 'verified'
    or coalesce(p_total_value, -1) < 0
    or coalesce(p_cash_balance, -1) < 0
    or coalesce(p_contribution_amount, 0) <= 0
    or round(p_contribution_amount, 8) <> goal.contribution_amount
    or coalesce(p_min_trade_value, -1) < 0
    or round(p_min_trade_value, 8) <> policy.min_trade_value
    or coalesce(p_max_drift_pct, -1) < 0
    or coalesce(p_cash_remainder, -1) < 0
    or p_cash_remainder > p_contribution_amount
    or coalesce(p_estimated_cash_after, -1) < 0
    or abs(p_estimated_cash_after - (p_cash_balance + p_cash_remainder)) > 0.01
    or p_expires_at is null or p_expires_at <= timezone('utc', now())
    or p_valuation_as_of is null
    or p_valuation_as_of > timezone('utc', now()) + interval '5 minutes'
    or p_valuation_as_of < timezone('utc', now()) - interval '96 hours' then
    raise exception 'contribution plan is not safe to persist' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 500 then
    raise exception 'invalid contribution item count' using errcode = '22023';
  end if;
  select count(distinct upper(trim(value->>'symbol'))) into distinct_count
  from jsonb_array_elements(p_items);
  select count(*) into target_count from public.portfolio_allocation_targets
  where portfolio_id = p_portfolio_id and user_id = p_user_id;
  if distinct_count <> item_count or target_count <> item_count
    or exists (
      select 1 from public.portfolio_allocation_targets t
      where t.portfolio_id = p_portfolio_id and t.user_id = p_user_id
        and not exists (
          select 1 from jsonb_array_elements(p_items) i
          where upper(trim(i->>'symbol')) = t.symbol
            and round((i->>'targetPct')::numeric, 4) = t.target_pct
        )
    ) then
    raise exception 'contribution items must exactly snapshot the allocation targets' using errcode = '22023';
  end if;

  select * into open_run from public.portfolio_rebalance_runs
  where portfolio_id = p_portfolio_id and status in ('pending', 'approved')
  order by created_at desc limit 1 for update;
  if found then
    select (
      open_run.expires_at <= timezone('utc', now())
      or open_run.policy_updated_at is distinct from policy.updated_at
      or open_run.portfolio_updated_at is distinct from owned.updated_at
      or (
        open_run.plan_kind = 'contribution'
        and not exists (
          select 1 from public.portfolio_goals g
          where g.id = open_run.goal_id and g.user_id = open_run.user_id
            and g.portfolio_id = open_run.portfolio_id and g.status = 'active'
            and g.updated_at = open_run.goal_updated_at
        )
      )
    ) into open_is_stale;
    if open_is_stale then
      update public.portfolio_rebalance_runs set
        status = 'expired', expired_at = timezone('utc', now()),
        terminal_reason = 'Investment plan expired or its source data changed',
        updated_at = timezone('utc', now())
      where id = open_run.id;
      insert into public.portfolio_rebalance_events(
        run_id, portfolio_id, user_id, event, from_status, to_status, actor, reason
      ) values (
        open_run.id, open_run.portfolio_id, open_run.user_id, 'expired', open_run.status,
        'expired', 'system', 'Investment plan expired or its source data changed'
      );
      update public.portfolio_rebalance_deliveries set
        status = 'disabled', last_error = 'Run is no longer pending review',
        updated_at = timezone('utc', now())
      where run_id = open_run.id and status in ('pending', 'retry', 'processing');
    else
      raise exception 'another investment plan is awaiting review or completion' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('symbol', symbol, 'targetPct', target_pct) order by symbol
  ), '[]'::jsonb) into snapshot_targets
  from public.portfolio_allocation_targets
  where portfolio_id = p_portfolio_id and user_id = p_user_id;

  insert into public.portfolio_rebalance_runs(
    portfolio_id, user_id, status, source, plan_hash, policy_updated_at,
    portfolio_updated_at, policy_snapshot, valuation_as_of, valuation_quality,
    total_value, cash_balance, drift_threshold_pct, min_trade_value, max_drift_pct,
    estimated_cash_after, expires_at, plan_kind, goal_id, goal_updated_at,
    scheduled_for, contribution_amount, cash_remainder
  ) values (
    p_portfolio_id, p_user_id, 'pending', p_source, p_plan_hash, p_policy_updated_at,
    p_portfolio_updated_at,
    jsonb_build_object(
      'goal', jsonb_build_object(
        'id', goal.id, 'name', goal.name, 'targetAmount', goal.target_amount,
        'targetDate', goal.target_date, 'expectedAnnualReturnPct', goal.expected_annual_return_pct,
        'contributionAmount', goal.contribution_amount, 'contributionDay', goal.contribution_day,
        'updatedAt', goal.updated_at
      ),
      'policy', jsonb_build_object(
        'driftThresholdPct', policy.drift_threshold_pct,
        'minTradeValue', policy.min_trade_value,
        'emailEnabled', policy.rebalance_email_enabled,
        'pushEnabled', policy.rebalance_push_enabled,
        'updatedAt', policy.updated_at
      ),
      'targets', snapshot_targets
    ),
    p_valuation_as_of, p_valuation_quality, round(p_total_value, 8), round(p_cash_balance, 8),
    policy.drift_threshold_pct, round(p_min_trade_value, 8), round(p_max_drift_pct, 6),
    round(p_estimated_cash_after, 8), p_expires_at, 'contribution', goal.id, goal.updated_at,
    p_scheduled_for, round(p_contribution_amount, 8), round(p_cash_remainder, 8)
  ) returning * into inserted_run;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or upper(trim(coalesce(item->>'symbol', ''))) !~ '^[A-Z0-9.:-]{1,20}$'
      or coalesce(item->>'action', '') not in ('buy', 'hold')
      or coalesce((item->>'currentQuantity')::numeric, -1) < 0
      or coalesce((item->>'currentValue')::numeric, -1) < 0
      or item->>'currentPct' is null
      or coalesce((item->>'targetValue')::numeric, -1) < 0
      or coalesce((item->>'targetPct')::numeric, -1) < 0
      or (item->>'targetPct')::numeric > 100
      or item->>'driftPct' is null
      or coalesce((item->>'tradeValue')::numeric, -1) < 0 then
      raise exception 'invalid contribution item' using errcode = '22023';
    end if;
    if item->>'action' = 'hold' and coalesce((item->>'tradeValue')::numeric, -1) <> 0 then
      raise exception 'hold contribution items cannot trade' using errcode = '22023';
    end if;
    if item->>'action' = 'buy' and (
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
      raise exception 'unsafe actionable contribution item' using errcode = '22023';
    end if;
    allocated_total := allocated_total + case
      when item->>'action' = 'buy' then round((item->>'tradeValue')::numeric, 8)
      else 0
    end;
    insert into public.portfolio_rebalance_items(
      run_id, portfolio_id, user_id, ordinal, symbol, current_quantity,
      reference_price, price_as_of, provenance, current_value, current_pct,
      target_value, target_pct, drift_pct, action, trade_value, estimated_quantity
    ) values (
      inserted_run.id, p_portfolio_id, p_user_id, ordinal_value, upper(trim(item->>'symbol')),
      round((item->>'currentQuantity')::numeric, 12),
      case when item->>'referencePrice' is null then null else round((item->>'referencePrice')::numeric, 8) end,
      case when item->>'priceAsOf' is null then null else (item->>'priceAsOf')::timestamptz end,
      item->'provenance', round((item->>'currentValue')::numeric, 8),
      round((item->>'currentPct')::numeric, 6), round((item->>'targetValue')::numeric, 8),
      round((item->>'targetPct')::numeric, 6), round((item->>'driftPct')::numeric, 6),
      item->>'action', round((item->>'tradeValue')::numeric, 8),
      case when item->>'estimatedQuantity' is null then null
        else round((item->>'estimatedQuantity')::numeric, 12) end
    );
    ordinal_value := ordinal_value + 1;
  end loop;

  select coalesce(max(abs(drift_pct)), 0) into stored_max_drift
  from public.portfolio_rebalance_items where run_id = inserted_run.id;
  if abs(allocated_total + round(p_cash_remainder, 8) - round(p_contribution_amount, 8)) > 0.01
    or abs(stored_max_drift - round(p_max_drift_pct, 6)) > 0.000001 then
    raise exception 'contribution allocation totals do not match the immutable plan' using errcode = '22023';
  end if;

  insert into public.portfolio_rebalance_events(
    run_id, portfolio_id, user_id, event, to_status, actor, details,
    idempotency_key, request_hash
  ) values (
    inserted_run.id, p_portfolio_id, p_user_id, 'created', 'pending',
    case when p_source = 'scheduled' then 'system' else 'user' end,
    jsonb_build_object(
      'source', p_source, 'planKind', 'contribution', 'planHash', p_plan_hash,
      'goalId', goal.id, 'scheduledFor', p_scheduled_for,
      'contributionAmount', round(p_contribution_amount, 8),
      'cashRemainder', round(p_cash_remainder, 8)
    ), p_idempotency_key, p_request_hash
  );

  if p_source = 'scheduled' then
    update public.portfolio_goals set
      next_contribution_date = public.next_portfolio_goal_contribution_date(
        p_scheduled_for, goal.contribution_day
      ),
      last_contribution_scan_at = timezone('utc', now())
    where id = goal.id;
  end if;
  return jsonb_build_object('runId', inserted_run.id, 'created', true);
end;
$$;
revoke all on function public.create_portfolio_contribution_run(
  uuid, uuid, uuid, text, date, text, timestamptz, timestamptz, timestamptz,
  timestamptz, text, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, timestamptz, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_portfolio_contribution_run(
  uuid, uuid, uuid, text, date, text, timestamptz, timestamptz, timestamptz,
  timestamptz, text, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, timestamptz, jsonb, text, text
) to service_role;

create or replace function public.transition_portfolio_contribution_run(
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
  goal public.portfolio_goals%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  next_status text;
  buy_count integer;
  price_count integer;
  distinct_price_count integer;
  target_portfolio_id uuid;
  target_kind text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'contribution'
      or existing.request_hash is distinct from p_request_hash
      or existing.event <> p_action then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return existing.run_id;
  end if;

  select portfolio_id, plan_kind into target_portfolio_id, target_kind
  from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if target_portfolio_id is null or target_kind is distinct from 'contribution' then
    raise exception 'contribution run not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || target_portfolio_id::text, 0));
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id and plan_kind = 'contribution'
  for update;
  if not found then raise exception 'contribution run not found' using errcode = 'P0002'; end if;

  if p_action = 'approved' then
    if run.status <> 'pending' then
      raise exception 'only pending contribution runs can be approved' using errcode = 'P0001';
    end if;
    if run.expires_at <= timezone('utc', now()) then
      raise exception 'contribution run expired' using errcode = 'P0001';
    end if;
    select * into owned from public.portfolios
    where id = run.portfolio_id and user_id = p_user_id and status = 'active'
    for update;
    if not found then raise exception 'active portfolio not found' using errcode = 'P0002'; end if;
    select * into goal from public.portfolio_goals
    where id = run.goal_id and portfolio_id = run.portfolio_id and user_id = p_user_id
      and status = 'active'
    for update;
    if not found then raise exception 'active portfolio goal not found' using errcode = 'P0002'; end if;
    select * into policy from public.portfolio_allocation_policies
    where portfolio_id = run.portfolio_id and user_id = p_user_id
    for update;
    if not found then raise exception 'allocation policy not found' using errcode = 'P0002'; end if;
    if owned.updated_at is distinct from run.portfolio_updated_at
      or goal.updated_at is distinct from run.goal_updated_at
      or policy.updated_at is distinct from run.policy_updated_at then
      raise exception 'portfolio, goal or policy changed; generate a new plan' using errcode = '40001';
    end if;
    if p_details is null or jsonb_typeof(p_details) <> 'object'
      or jsonb_typeof(p_details->'prices') <> 'array' then
      raise exception 'approval price snapshot is required' using errcode = '22023';
    end if;
    select count(*) into buy_count from public.portfolio_rebalance_items
    where run_id = run.id and action = 'buy';
    if jsonb_array_length(p_details->'prices') <> buy_count then
      raise exception 'approval price snapshot has an invalid item count' using errcode = '22023';
    end if;
    select count(*), count(distinct upper(trim(value->>'symbol')))
      into price_count, distinct_price_count
    from jsonb_array_elements(p_details->'prices')
    where jsonb_typeof(value) = 'object'
      and upper(trim(coalesce(value->>'symbol', ''))) ~ '^[A-Z0-9.:-]{1,20}$'
      and coalesce((value->>'price')::numeric, 0) > 0
      and value->>'priceAsOf' is not null
      and (value->>'priceAsOf')::timestamptz <= timezone('utc', now()) + interval '5 minutes'
      and (value->>'priceAsOf')::timestamptz >= timezone('utc', now()) - interval '96 hours'
      and exists (
        select 1 from public.portfolio_rebalance_items i
        where i.run_id = run.id and i.action = 'buy'
          and i.symbol = upper(trim(value->>'symbol'))
          and abs((value->>'price')::numeric / i.reference_price - 1) <= 0.03
      );
    if price_count <> buy_count or distinct_price_count <> buy_count then
      raise exception 'approval prices do not cover the proposed contribution orders' using errcode = '22023';
    end if;
    next_status := 'approved';
  elsif p_action = 'rejected' then
    if run.status not in ('pending', 'approved') then
      raise exception 'contribution run cannot be rejected' using errcode = 'P0001';
    end if;
    next_status := 'rejected';
  elsif p_action = 'expired' then
    if run.status not in ('pending', 'approved') then
      raise exception 'contribution run cannot be expired' using errcode = 'P0001';
    end if;
    next_status := 'expired';
  else
    raise exception 'invalid contribution transition action' using errcode = '22023';
  end if;
  if p_action in ('rejected', 'expired') and char_length(trim(coalesce(p_reason, ''))) < 1 then
    raise exception 'transition reason is required' using errcode = '22023';
  end if;

  update public.portfolio_rebalance_runs set
    status = next_status,
    approved_at = case when next_status = 'approved' then timezone('utc', now()) else approved_at end,
    rejected_at = case when next_status = 'rejected' then timezone('utc', now()) else rejected_at end,
    expired_at = case when next_status = 'expired' then timezone('utc', now()) else expired_at end,
    terminal_reason = case when next_status in ('rejected', 'expired')
      then left(trim(p_reason), 500) else terminal_reason end,
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
  update public.portfolio_rebalance_deliveries set
    status = 'disabled', last_error = 'Run is no longer pending review',
    updated_at = timezone('utc', now())
  where run_id = run.id and status in ('pending', 'retry', 'processing');
  return run.id;
end;
$$;
revoke all on function public.transition_portfolio_contribution_run(
  uuid, uuid, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.transition_portfolio_contribution_run(
  uuid, uuid, text, text, jsonb, text, text
) to service_role;

create or replace function public.complete_portfolio_contribution_run(
  p_user_id uuid,
  p_run_id uuid,
  p_deposit_at timestamptz,
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
  goal public.portfolio_goals%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  existing public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  approval_event public.portfolio_rebalance_events%rowtype;
  fill_record record;
  inserted_transaction public.portfolio_transactions%rowtype;
  target_portfolio_id uuid;
  target_kind text;
  fill_count integer;
  expected_count integer;
  unique_count integer;
  validated_count integer := 0;
  approval_price numeric;
  fill_quantity numeric(28, 12);
  fill_price numeric(28, 8);
  fill_fees numeric(28, 8);
  fill_trade_at timestamptz;
  total_actual_cost numeric := 0;
  actual_cash_remainder numeric(28, 8);
  derived_key text;
  deposit_key text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'contribution'
      or existing.request_hash is distinct from p_request_hash
      or existing.event <> 'completed' then
      raise exception 'idempotency key belongs to a different request or plan kind' using errcode = '22023';
    end if;
    return existing.run_id;
  end if;

  select portfolio_id, plan_kind into target_portfolio_id, target_kind
  from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id;
  if target_portfolio_id is null or target_kind is distinct from 'contribution' then
    raise exception 'contribution run not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rebalance:portfolio:' || target_portfolio_id::text, 0));
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id and plan_kind = 'contribution'
  for update;
  if not found then raise exception 'contribution run not found' using errcode = 'P0002'; end if;
  if run.status <> 'approved' then
    raise exception 'only approved contribution runs can be completed' using errcode = 'P0001';
  end if;
  if run.expires_at <= timezone('utc', now()) then
    raise exception 'contribution run expired' using errcode = 'P0001';
  end if;
  if p_deposit_at is null or p_deposit_at < run.approved_at
    or p_deposit_at > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'invalid contribution deposit time' using errcode = '22023';
  end if;

  select * into owned from public.portfolios
  where id = run.portfolio_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception 'active portfolio not found' using errcode = 'P0002'; end if;
  select * into goal from public.portfolio_goals
  where id = run.goal_id and portfolio_id = run.portfolio_id and user_id = p_user_id
    and status = 'active'
  for update;
  if not found then raise exception 'active portfolio goal not found' using errcode = 'P0002'; end if;
  select * into policy from public.portfolio_allocation_policies
  where portfolio_id = run.portfolio_id and user_id = p_user_id
  for update;
  if not found then raise exception 'allocation policy not found' using errcode = 'P0002'; end if;
  if owned.updated_at is distinct from run.portfolio_updated_at
    or goal.updated_at is distinct from run.goal_updated_at
    or policy.updated_at is distinct from run.policy_updated_at then
    raise exception 'portfolio, goal or policy changed; approval is no longer valid' using errcode = '40001';
  end if;

  select * into approval_event from public.portfolio_rebalance_events
  where run_id = run.id and event = 'approved'
  order by id desc limit 1;
  if not found or jsonb_typeof(approval_event.details->'prices') <> 'array' then
    raise exception 'approval price snapshot is missing' using errcode = 'P0001';
  end if;
  if p_fills is null or jsonb_typeof(p_fills) <> 'array' then
    raise exception 'fills must be an array' using errcode = '22023';
  end if;
  fill_count := jsonb_array_length(p_fills);
  select count(*) into expected_count from public.portfolio_rebalance_items
  where run_id = run.id and action = 'buy';
  select count(distinct value->>'itemId') into unique_count from jsonb_array_elements(p_fills);
  if fill_count <> expected_count or unique_count <> expected_count then
    raise exception 'exactly one fill is required for every proposed contribution order' using errcode = '22023';
  end if;

  -- Validate all fills and aggregate their cash requirement before appending any
  -- ledger row. Any later error still rolls the whole RPC transaction back.
  for fill_record in
    select i.*, value as fill
    from jsonb_array_elements(p_fills) f(value)
    join public.portfolio_rebalance_items i
      on i.id = (value->>'itemId')::uuid and i.run_id = run.id and i.action = 'buy'
    order by (value->>'tradeAt')::timestamptz, i.ordinal
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
      or coalesce(fill_fees, -1) < 0
      or fill_trade_at is null
      or fill_trade_at < p_deposit_at
      or fill_trade_at < run.approved_at
      or fill_trade_at > timezone('utc', now()) + interval '5 minutes'
      or fill_quantity * fill_price < run.min_trade_value
      or approval_price is null
      or abs(fill_price / fill_record.reference_price - 1) > 0.03
      or abs(fill_price / approval_price - 1) > 0.03 then
      raise exception 'fill failed price, time or minimum-order safety checks' using errcode = '22023';
    end if;
    total_actual_cost := total_actual_cost + fill_quantity * fill_price + fill_fees;
    validated_count := validated_count + 1;
  end loop;
  if validated_count <> expected_count then
    raise exception 'fill mapping is incomplete' using errcode = '22023';
  end if;
  if total_actual_cost > run.contribution_amount then
    raise exception 'actual contribution orders exceed the approved deposit' using errcode = 'P0001';
  end if;
  actual_cash_remainder := round(run.contribution_amount - total_actual_cost, 8);

  deposit_key := 'p8:' || replace(run.id::text, '-', '') || ':deposit';
  select * into inserted_transaction from public.append_portfolio_transaction(
    p_user_id,
    run.portfolio_id,
    deposit_key,
    'deposit',
    null,
    0,
    0,
    run.contribution_amount,
    0,
    p_deposit_at,
    'Approved goal contribution ' || run.id::text
  );
  if inserted_transaction.portfolio_id is distinct from run.portfolio_id
    or inserted_transaction.user_id is distinct from p_user_id
    or inserted_transaction.kind is distinct from 'deposit'
    or inserted_transaction.symbol is not null
    or inserted_transaction.quantity is distinct from 0::numeric
    or inserted_transaction.price is distinct from 0::numeric
    or inserted_transaction.cash_amount is distinct from run.contribution_amount
    or inserted_transaction.fees is distinct from 0::numeric
    or inserted_transaction.trade_at is distinct from p_deposit_at
    or inserted_transaction.idempotency_key is distinct from deposit_key then
    raise exception 'derived contribution deposit idempotency key collision' using errcode = '22023';
  end if;

  for fill_record in
    select i.*, value as fill
    from jsonb_array_elements(p_fills) f(value)
    join public.portfolio_rebalance_items i
      on i.id = (value->>'itemId')::uuid and i.run_id = run.id and i.action = 'buy'
    order by (value->>'tradeAt')::timestamptz, i.ordinal
  loop
    fill_quantity := round((fill_record.fill->>'quantity')::numeric, 12);
    fill_price := round((fill_record.fill->>'price')::numeric, 8);
    fill_fees := round((fill_record.fill->>'fees')::numeric, 8);
    fill_trade_at := (fill_record.fill->>'tradeAt')::timestamptz;
    derived_key := 'p8:' || replace(run.id::text, '-', '') || ':'
      || replace(fill_record.id::text, '-', '');
    select * into inserted_transaction from public.append_portfolio_transaction(
      p_user_id,
      run.portfolio_id,
      derived_key,
      'buy',
      fill_record.symbol,
      fill_quantity,
      fill_price,
      0,
      fill_fees,
      fill_trade_at,
      'Approved goal contribution ' || run.id::text
    );
    if inserted_transaction.portfolio_id is distinct from run.portfolio_id
      or inserted_transaction.user_id is distinct from p_user_id
      or inserted_transaction.kind is distinct from 'buy'
      or inserted_transaction.symbol is distinct from fill_record.symbol
      or inserted_transaction.quantity is distinct from fill_quantity
      or inserted_transaction.price is distinct from fill_price
      or inserted_transaction.cash_amount is distinct from 0::numeric
      or inserted_transaction.fees is distinct from fill_fees
      or inserted_transaction.trade_at is distinct from fill_trade_at
      or inserted_transaction.idempotency_key is distinct from derived_key then
      raise exception 'derived contribution fill idempotency key collision' using errcode = '22023';
    end if;
    insert into public.portfolio_rebalance_fills(
      item_id, run_id, portfolio_id, user_id, transaction_id,
      actual_quantity, actual_price, actual_fees, actual_notional, executed_at
    ) values (
      fill_record.id, run.id, run.portfolio_id, p_user_id, inserted_transaction.id,
      fill_quantity, fill_price, fill_fees, round(fill_quantity * fill_price, 8), fill_trade_at
    );
  end loop;
  if (select count(*) from public.portfolio_rebalance_fills where run_id = run.id) <> expected_count then
    raise exception 'fill mapping is incomplete' using errcode = '22023';
  end if;

  update public.portfolio_rebalance_runs set
    status = 'completed', deposit_transaction_id = (
      select id from public.portfolio_transactions
      where user_id = p_user_id and idempotency_key = deposit_key
    ),
    completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = run.id;
  insert into public.portfolio_rebalance_events(
    run_id, portfolio_id, user_id, event, from_status, to_status, actor,
    details, idempotency_key, request_hash
  ) values (
    run.id, run.portfolio_id, p_user_id, 'completed', 'approved', 'completed', 'user',
    jsonb_build_object(
      'depositTransactionId', (
        select id from public.portfolio_transactions
        where user_id = p_user_id and idempotency_key = deposit_key
      ),
      'fillCount', expected_count,
      'actualCost', total_actual_cost,
      'actualCashRemainder', actual_cash_remainder
    ), p_idempotency_key, p_request_hash
  );
  return run.id;
end;
$$;
revoke all on function public.complete_portfolio_contribution_run(
  uuid, uuid, timestamptz, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.complete_portfolio_contribution_run(
  uuid, uuid, timestamptz, jsonb, text, text
) to service_role;

-- Keep P7 fill reversal auditing and extend it to the contribution deposit link.
-- Reversals do not rewrite the immutable completed plan; each reversal is a new
-- append-only ledger row plus a corresponding audit event.
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
        'linkType', 'fill',
        'itemId', linked.item_id,
        'transactionId', new.reversal_of,
        'reversalTransactionId', new.id
      )
    );
    return new;
  end if;

  select r.id as run_id, r.portfolio_id, r.user_id
    into linked
  from public.portfolio_rebalance_runs r
  where r.plan_kind = 'contribution' and r.deposit_transaction_id = new.reversal_of;
  if found then
    insert into public.portfolio_rebalance_events(
      run_id, portfolio_id, user_id, event, from_status, to_status, actor, details
    ) values (
      linked.run_id, linked.portfolio_id, linked.user_id, 'execution_reversed',
      'completed', 'completed', 'user',
      jsonb_build_object(
        'linkType', 'deposit',
        'transactionId', new.reversal_of,
        'reversalTransactionId', new.id
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_rebalance_execution_reversal() from public, anon, authenticated, service_role;
