-- Perplexity Finance v1.7.0 P6 target allocation and rebalancing policy.

create table if not exists public.portfolio_allocation_policies (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  drift_threshold_pct numeric(8, 4) not null default 5 check (drift_threshold_pct > 0 and drift_threshold_pct <= 100),
  min_trade_value numeric(28, 8) not null default 100 check (min_trade_value >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, portfolio_id)
);

create table if not exists public.portfolio_allocation_targets (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.:-]{1,20}$'),
  target_pct numeric(8, 4) not null check (target_pct > 0 and target_pct <= 100),
  created_at timestamptz not null default timezone('utc', now()),
  primary key(portfolio_id, symbol)
);

create index if not exists portfolio_allocation_targets_user_idx
  on public.portfolio_allocation_targets(user_id, portfolio_id, symbol);

drop trigger if exists portfolio_allocation_policies_set_updated_at on public.portfolio_allocation_policies;
create trigger portfolio_allocation_policies_set_updated_at
  before update on public.portfolio_allocation_policies
  for each row execute function public.set_updated_at();

alter table public.portfolio_allocation_policies enable row level security;
alter table public.portfolio_allocation_targets enable row level security;

drop policy if exists portfolio_allocation_policies_select_own on public.portfolio_allocation_policies;
create policy portfolio_allocation_policies_select_own on public.portfolio_allocation_policies for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists portfolio_allocation_targets_select_own on public.portfolio_allocation_targets;
create policy portfolio_allocation_targets_select_own on public.portfolio_allocation_targets for select to authenticated
  using (auth.uid() = user_id);

grant select on public.portfolio_allocation_policies, public.portfolio_allocation_targets to authenticated;
revoke all on public.portfolio_allocation_policies, public.portfolio_allocation_targets from anon;
revoke insert, update, delete on public.portfolio_allocation_policies, public.portfolio_allocation_targets from authenticated;
revoke insert, update, delete on public.portfolio_allocation_policies, public.portfolio_allocation_targets from service_role;
grant select on public.portfolio_allocation_policies, public.portfolio_allocation_targets to service_role;

create or replace function public.replace_portfolio_allocation_policy(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_drift_threshold_pct numeric,
  p_min_trade_value numeric,
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

  insert into public.portfolio_allocation_policies(portfolio_id, user_id, drift_threshold_pct, min_trade_value)
  values (p_portfolio_id, p_user_id, p_drift_threshold_pct, p_min_trade_value)
  on conflict (portfolio_id) do update set
    drift_threshold_pct = excluded.drift_threshold_pct,
    min_trade_value = excluded.min_trade_value;

  delete from public.portfolio_allocation_targets where portfolio_id = p_portfolio_id;
  insert into public.portfolio_allocation_targets(portfolio_id, user_id, symbol, target_pct)
  select p_portfolio_id, p_user_id, upper(trim(value->>'symbol')), (value->>'targetPct')::numeric
  from jsonb_array_elements(p_targets);
end;
$$;

revoke all on function public.replace_portfolio_allocation_policy(uuid, uuid, numeric, numeric, jsonb) from public;
grant execute on function public.replace_portfolio_allocation_policy(uuid, uuid, numeric, numeric, jsonb) to service_role;
