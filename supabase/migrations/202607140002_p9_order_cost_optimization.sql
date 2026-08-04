-- Perplexity Finance v1.10.0 P9 tax, commission and slippage-aware order optimization.
--
-- P9 extends the existing P7/P8 durable plan workflow. It never submits broker
-- orders and it never posts estimated tax to the cash ledger. The legacy
-- `fees` value remains the user-entered commission actually charged by the
-- broker; estimated/derived tax and slippage live only in immutable plan/fill
-- evidence.

alter table public.portfolio_allocation_policies
  add column if not exists commission_fixed_usd numeric(28, 8) not null default 0,
  add column if not exists commission_bps numeric(12, 6) not null default 0,
  add column if not exists buy_slippage_bps numeric(12, 6) not null default 5,
  add column if not exists sell_slippage_bps numeric(12, 6) not null default 5,
  add column if not exists sell_transaction_tax_bps numeric(12, 6) not null default 0,
  add column if not exists capital_gains_tax_pct numeric(8, 4) not null default 0,
  add column if not exists max_cost_pct numeric(8, 4) not null default 2;

alter table public.portfolio_allocation_policies
  drop constraint if exists portfolio_allocation_policies_p9_costs_check;
alter table public.portfolio_allocation_policies
  add constraint portfolio_allocation_policies_p9_costs_check check (
    commission_fixed_usd >= 0 and commission_fixed_usd <= 1000000000
    and commission_bps >= 0 and commission_bps <= 10000
    and buy_slippage_bps >= 0 and buy_slippage_bps <= 10000
    and sell_slippage_bps >= 0 and sell_slippage_bps <= 10000
    and sell_transaction_tax_bps >= 0 and sell_transaction_tax_bps <= 10000
    and capital_gains_tax_pct >= 0 and capital_gains_tax_pct <= 100
    and max_cost_pct >= 0 and max_cost_pct <= 100
  );

-- Cost policy changes are user-authored policy changes. Advancing updated_at
-- makes every pending/approved P7/P8 plan fail the existing optimistic-version
-- checks and therefore require a newly generated plan and approval.
drop trigger if exists portfolio_allocation_policies_set_updated_at
  on public.portfolio_allocation_policies;
create trigger portfolio_allocation_policies_set_updated_at
  before update on public.portfolio_allocation_policies
  for each row
  when (
    old.drift_threshold_pct is distinct from new.drift_threshold_pct
    or old.min_trade_value is distinct from new.min_trade_value
    or old.rebalance_email_enabled is distinct from new.rebalance_email_enabled
    or old.rebalance_push_enabled is distinct from new.rebalance_push_enabled
    or old.commission_fixed_usd is distinct from new.commission_fixed_usd
    or old.commission_bps is distinct from new.commission_bps
    or old.buy_slippage_bps is distinct from new.buy_slippage_bps
    or old.sell_slippage_bps is distinct from new.sell_slippage_bps
    or old.sell_transaction_tax_bps is distinct from new.sell_transaction_tax_bps
    or old.capital_gains_tax_pct is distinct from new.capital_gains_tax_pct
    or old.max_cost_pct is distinct from new.max_cost_pct
  )
  execute function public.set_updated_at();

create or replace function public.replace_portfolio_allocation_policy_p9(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_drift_threshold_pct numeric,
  p_min_trade_value numeric,
  p_rebalance_email_enabled boolean,
  p_rebalance_push_enabled boolean,
  p_commission_fixed_usd numeric,
  p_commission_bps numeric,
  p_buy_slippage_bps numeric,
  p_sell_slippage_bps numeric,
  p_sell_transaction_tax_bps numeric,
  p_capital_gains_tax_pct numeric,
  p_max_cost_pct numeric,
  p_targets jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_commission_fixed_usd, -1) < 0 or p_commission_fixed_usd > 1000000000
    or coalesce(p_commission_bps, -1) < 0 or p_commission_bps > 10000
    or coalesce(p_buy_slippage_bps, -1) < 0 or p_buy_slippage_bps > 10000
    or coalesce(p_sell_slippage_bps, -1) < 0 or p_sell_slippage_bps > 10000
    or coalesce(p_sell_transaction_tax_bps, -1) < 0 or p_sell_transaction_tax_bps > 10000
    or coalesce(p_capital_gains_tax_pct, -1) < 0 or p_capital_gains_tax_pct > 100
    or coalesce(p_max_cost_pct, -1) < 0 or p_max_cost_pct > 100 then
    raise exception 'invalid order cost policy' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('rebalance:portfolio:' || p_portfolio_id::text, 0)
  );

  -- Reuse the existing ownership, target and allocation-policy validation. Both
  -- calls are part of this RPC transaction, so a later error rolls everything
  -- back.
  perform public.replace_portfolio_allocation_policy(
    p_user_id, p_portfolio_id, p_drift_threshold_pct, p_min_trade_value,
    p_rebalance_email_enabled, p_rebalance_push_enabled, p_targets
  );

  update public.portfolio_allocation_policies set
    commission_fixed_usd = round(p_commission_fixed_usd, 2),
    commission_bps = round(p_commission_bps, 4),
    buy_slippage_bps = round(p_buy_slippage_bps, 4),
    sell_slippage_bps = round(p_sell_slippage_bps, 4),
    sell_transaction_tax_bps = round(p_sell_transaction_tax_bps, 4),
    capital_gains_tax_pct = round(p_capital_gains_tax_pct, 4),
    max_cost_pct = round(p_max_cost_pct, 4),
    updated_at = timezone('utc', now())
  where portfolio_id = p_portfolio_id and user_id = p_user_id;

  if not found then
    raise exception 'allocation policy not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.replace_portfolio_allocation_policy_p9(
  uuid, uuid, numeric, numeric, boolean, boolean, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_portfolio_allocation_policy_p9(
  uuid, uuid, numeric, numeric, boolean, boolean, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, jsonb
) to service_role;

-- Durable, immutable P9 evidence. Version 0 is the explicit compatibility form
-- for every plan/fill created before this migration.
alter table public.portfolio_rebalance_runs
  add column if not exists cost_model_version smallint not null default 0,
  add column if not exists cost_policy_snapshot jsonb not null default
    '{"commissionFixedUsd":0,"commissionBps":0,"buySlippageBps":0,"sellSlippageBps":0,"sellTransactionTaxBps":0,"capitalGainsTaxPct":0,"maxCostPct":0,"taxLotMethod":"fifo"}'::jsonb;

alter table public.portfolio_rebalance_items
  add column if not exists requested_trade_value numeric(28, 8) not null default 0,
  add column if not exists optimization_decision text not null default 'not-required',
  add column if not exists estimated_costs jsonb not null default
    '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb,
  add column if not exists tax_lot_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists estimated_cost_basis numeric(28, 8) not null default 0;

alter table public.portfolio_rebalance_fills
  add column if not exists actual_costs jsonb not null default
    '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb;

update public.portfolio_rebalance_runs set
  cost_model_version = 0,
  cost_policy_snapshot =
    '{"commissionFixedUsd":0,"commissionBps":0,"buySlippageBps":0,"sellSlippageBps":0,"sellTransactionTaxBps":0,"capitalGainsTaxPct":0,"maxCostPct":0,"taxLotMethod":"fifo"}'::jsonb
where cost_model_version = 0;

update public.portfolio_rebalance_items set
  requested_trade_value = trade_value,
  optimization_decision = case
    when action in ('buy', 'sell') then 'execute'
    else 'not-required'
  end,
  estimated_costs =
    '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb,
  tax_lot_snapshot = '[]'::jsonb,
  estimated_cost_basis = 0
where run_id in (
  select id from public.portfolio_rebalance_runs where cost_model_version = 0
);

update public.portfolio_rebalance_fills set
  actual_costs =
    '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb
where run_id in (
  select id from public.portfolio_rebalance_runs where cost_model_version = 0
);

alter table public.portfolio_rebalance_runs
  drop constraint if exists portfolio_rebalance_runs_p9_cost_model_check;
alter table public.portfolio_rebalance_runs
  add constraint portfolio_rebalance_runs_p9_cost_model_check check (
    cost_model_version in (0, 1)
    and jsonb_typeof(cost_policy_snapshot) = 'object'
    and cost_policy_snapshot->>'taxLotMethod' = 'fifo'
    and pg_column_size(cost_policy_snapshot) <= 8192
  );

alter table public.portfolio_rebalance_items
  drop constraint if exists portfolio_rebalance_items_p9_costs_check;
alter table public.portfolio_rebalance_items
  add constraint portfolio_rebalance_items_p9_costs_check check (
    requested_trade_value >= 0
    and optimization_decision in (
      'execute', 'not-required', 'below-minimum', 'cost-inefficient',
      'cash-limited', 'invalid-tax-lots'
    )
    and jsonb_typeof(estimated_costs) = 'object'
    and jsonb_typeof(tax_lot_snapshot) = 'array'
    and estimated_cost_basis >= 0
    and pg_column_size(estimated_costs) <= 8192
    and pg_column_size(tax_lot_snapshot) <= 65536
  );

alter table public.portfolio_rebalance_fills
  drop constraint if exists portfolio_rebalance_fills_p9_costs_check;
alter table public.portfolio_rebalance_fills
  add constraint portfolio_rebalance_fills_p9_costs_check check (
    jsonb_typeof(actual_costs) = 'object'
    and pg_column_size(actual_costs) <= 8192
  );

create or replace function public.p9_cost_number(p_costs jsonb, p_key text)
returns numeric
language sql
immutable
strict
set search_path = public
as $$
  select case
    when jsonb_typeof(p_costs->p_key) = 'number' then (p_costs->>p_key)::numeric
    else null
  end;
$$;
revoke all on function public.p9_cost_number(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.p9_cost_breakdown_is_valid(
  p_costs jsonb,
  p_signed_slippage boolean default false
) returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(p_costs) = 'object'
    and p_costs ?& array[
      'commission', 'slippage', 'transactionTax', 'capitalGainsTax',
      'tax', 'taxableGain', 'total', 'netCashEffect'
    ]
    and not exists (
      select 1 from jsonb_object_keys(p_costs) as keys(key)
      where key <> all (array[
        'commission', 'slippage', 'transactionTax', 'capitalGainsTax',
        'tax', 'taxableGain', 'total', 'netCashEffect'
      ])
    )
    and public.p9_cost_number(p_costs, 'commission') >= 0
    and (p_signed_slippage or public.p9_cost_number(p_costs, 'slippage') >= 0)
    and public.p9_cost_number(p_costs, 'transactionTax') >= 0
    and public.p9_cost_number(p_costs, 'capitalGainsTax') >= 0
    and public.p9_cost_number(p_costs, 'tax') >= 0
    and public.p9_cost_number(p_costs, 'taxableGain') >= 0
    and abs(
      public.p9_cost_number(p_costs, 'tax')
      - public.p9_cost_number(p_costs, 'transactionTax')
      - public.p9_cost_number(p_costs, 'capitalGainsTax')
    ) <= 0.00000001
    and abs(
      public.p9_cost_number(p_costs, 'total')
      - public.p9_cost_number(p_costs, 'commission')
      - public.p9_cost_number(p_costs, 'slippage')
      - public.p9_cost_number(p_costs, 'tax')
    ) <= 0.00000001,
    false
  );
$$;
revoke all on function public.p9_cost_breakdown_is_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.p9_fifo_cost_basis(
  p_lots jsonb,
  p_quantity numeric
) returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  lot jsonb;
  remaining numeric(28, 12) := round(coalesce(p_quantity, 0), 12);
  lot_quantity numeric(28, 12);
  lot_unit_cost numeric(28, 8);
  consumed numeric(28, 12);
  result numeric := 0;
begin
  if remaining < 0 or p_lots is null or jsonb_typeof(p_lots) <> 'array' then
    return null;
  end if;
  for lot in select value from jsonb_array_elements(p_lots)
  loop
    if remaining <= 0 then exit; end if;
    if jsonb_typeof(lot) <> 'object'
      or jsonb_typeof(lot->'quantity') <> 'number'
      or jsonb_typeof(lot->'unitCost') <> 'number' then
      return null;
    end if;
    lot_quantity := round((lot->>'quantity')::numeric, 12);
    lot_unit_cost := round((lot->>'unitCost')::numeric, 8);
    if lot_quantity <= 0 or lot_unit_cost < 0 then return null; end if;
    consumed := least(remaining, lot_quantity);
    -- The optimizer floors each consumed FIFO slice independently to cents.
    -- Flooring only after summing slices can overstate basis by one or more
    -- cents and produce a different capital-gains estimate.
    result := result + floor(consumed * lot_unit_cost * 100) / 100;
    remaining := round(remaining - consumed, 12);
  end loop;
  if remaining > 0.000000000001 then return null; end if;
  return round(result, 2);
end;
$$;
revoke all on function public.p9_fifo_cost_basis(jsonb, numeric)
  from public, anon, authenticated, service_role;

-- Reconstruct the exact still-open FIFO slices from the append-only ledger.
-- This prevents a compromised or stale service request from skipping an older
-- open lot, reusing an already-consumed lot, or overstating a lot's remainder.
create or replace function public.p9_current_fifo_lots(
  p_user_id uuid,
  p_portfolio_id uuid,
  p_symbol text,
  p_quantity numeric
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select ledger.*
    from public.portfolio_transactions ledger
    where ledger.user_id = p_user_id
      and ledger.portfolio_id = p_portfolio_id
      and ledger.symbol = upper(trim(p_symbol))
      and ledger.kind in ('buy', 'sell')
      and not exists (
        select 1 from public.portfolio_transactions reversal
        where reversal.reversal_of = ledger.id
      )
  ), sold as (
    select coalesce(sum(quantity) filter (where kind = 'sell'), 0) as quantity
    from active
  ), buys as (
    select active.*,
      sum(active.quantity) over (
        order by active.trade_at, active.created_at, active.id
        rows between unbounded preceding and current row
      ) as cumulative_bought
    from active
    where active.kind = 'buy'
  ), remaining as (
    select buys.*,
      greatest(least(
        buys.quantity,
        buys.cumulative_bought - sold.quantity
      ), 0) as open_quantity,
      round(
        (round(buys.quantity * buys.price, 8) + buys.fees) / buys.quantity,
        8
      ) as unit_cost
    from buys cross join sold
  ), open_lots as (
    select remaining.*,
      coalesce(sum(remaining.open_quantity) over (
        order by remaining.trade_at, remaining.created_at, remaining.id
        rows between unbounded preceding and 1 preceding
      ), 0) as open_before
    from remaining
    where remaining.open_quantity > 0.000000001
  ), slices as (
    select open_lots.*,
      least(
        open_lots.open_quantity,
        greatest(round(p_quantity, 12) - open_lots.open_before, 0)
      ) as slice_quantity
    from open_lots
    where open_lots.open_before < round(p_quantity, 12)
  ), coverage as (
    select coalesce(sum(slice_quantity), 0) as quantity from slices
  )
  select case
    when coalesce(p_quantity, -1) < 0
      or (select quantity from coverage) + 0.000000001 < round(p_quantity, 12)
      then null
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'transactionId', slices.id,
        'acquiredAt', slices.trade_at,
        'quantity', slices.slice_quantity,
        'unitCost', slices.unit_cost,
        'costBasis', floor(slices.slice_quantity * slices.unit_cost * 100) / 100
      ) order by slices.trade_at, slices.created_at, slices.id)
      from slices
      where slices.slice_quantity > 0
    ), '[]'::jsonb)
  end
  from coverage;
$$;
revoke all on function public.p9_current_fifo_lots(uuid, uuid, text, numeric)
  from public, anon, authenticated, service_role;

-- Preserve the P8 implementations as private transaction primitives, then
-- restore the exact public signatures below. The guard keeps this migration
-- structurally repeatable in development databases.
do $$
begin
  if to_regprocedure(
    'public.create_portfolio_rebalance_run_p8(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,text,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,text,text)'
  ) is null then
    alter function public.create_portfolio_rebalance_run(
      uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
      numeric, numeric, numeric, numeric, numeric, numeric, timestamptz,
      jsonb, text, text
    ) rename to create_portfolio_rebalance_run_p8;
  end if;

  if to_regprocedure(
    'public.complete_portfolio_rebalance_run_p8(uuid,uuid,jsonb,text,text)'
  ) is null then
    alter function public.complete_portfolio_rebalance_run(
      uuid, uuid, jsonb, text, text
    ) rename to complete_portfolio_rebalance_run_p8;
  end if;

  if to_regprocedure(
    'public.create_portfolio_contribution_run_p8(uuid,uuid,uuid,text,date,text,timestamptz,timestamptz,timestamptz,timestamptz,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,timestamptz,jsonb,text,text)'
  ) is null then
    alter function public.create_portfolio_contribution_run(
      uuid, uuid, uuid, text, date, text, timestamptz, timestamptz,
      timestamptz, timestamptz, text, numeric, numeric, numeric, numeric,
      numeric, numeric, numeric, timestamptz, jsonb, text, text
    ) rename to create_portfolio_contribution_run_p8;
  end if;

  if to_regprocedure(
    'public.complete_portfolio_contribution_run_p8(uuid,uuid,timestamptz,jsonb,text,text)'
  ) is null then
    alter function public.complete_portfolio_contribution_run(
      uuid, uuid, timestamptz, jsonb, text, text
    ) rename to complete_portfolio_contribution_run_p8;
  end if;
end;
$$;

revoke all on function public.create_portfolio_rebalance_run_p8(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz,
  jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_portfolio_rebalance_run_p8(
  uuid, uuid, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.create_portfolio_contribution_run_p8(
  uuid, uuid, uuid, text, date, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, timestamptz, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_portfolio_contribution_run_p8(
  uuid, uuid, timestamptz, jsonb, text, text
) from public, anon, authenticated, service_role;

create or replace function public.apply_p9_plan_costs(
  p_user_id uuid,
  p_run_id uuid,
  p_items jsonb,
  p_expected_cash_after numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.portfolio_rebalance_runs%rowtype;
  policy public.portfolio_allocation_policies%rowtype;
  stored_item public.portfolio_rebalance_items%rowtype;
  input_item jsonb;
  costs jsonb;
  lots jsonb;
  expected_lots jsonb;
  lot jsonb;
  expected_lot jsonb;
  lot_record record;
  source_transaction public.portfolio_transactions%rowtype;
  previous_acquired_at timestamptz;
  item_count integer;
  p9_item_count integer;
  matched_count integer := 0;
  requested_value numeric(28, 8);
  trade_value_value numeric(28, 8);
  estimated_basis numeric(28, 8);
  execution_notional numeric(28, 8);
  expected_commission numeric(28, 8);
  expected_slippage numeric(28, 8);
  expected_transaction_tax numeric(28, 8);
  expected_taxable_gain numeric(28, 8);
  expected_capital_tax numeric(28, 8);
  expected_tax numeric(28, 8);
  expected_total numeric(28, 8);
  expected_net_cash numeric(28, 8);
  total_commission numeric := 0;
  total_slippage numeric := 0;
  total_transaction_tax numeric := 0;
  total_capital_tax numeric := 0;
  total_tax numeric := 0;
  total_taxable_gain numeric := 0;
  total_cost numeric := 0;
  total_net_cash numeric := 0;
  lot_quantity numeric := 0;
  lot_basis numeric := 0;
  expected_cash numeric;
  decision text;
  snapshot jsonb;
begin
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'investment plan not found' using errcode = 'P0002';
  end if;

  select * into policy from public.portfolio_allocation_policies
  where portfolio_id = run.portfolio_id and user_id = p_user_id
  for update;
  if not found or policy.updated_at is distinct from run.policy_updated_at then
    raise exception 'allocation or cost policy changed while plan was generated'
      using errcode = '40001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(p_items);
  select count(*) into p9_item_count
  from jsonb_array_elements(p_items) as items(value)
  where items.value ?| array[
    'requestedTradeValue', 'optimizationDecision', 'estimatedCosts',
    'taxLotSnapshot', 'estimatedCostBasis'
  ];

  -- A fully legacy request remains valid during a rolling deployment. It gets
  -- an explicit v0 zero-cost representation; partial P9 evidence is rejected.
  if p9_item_count = 0 then
    update public.portfolio_rebalance_items set
      requested_trade_value = trade_value,
      optimization_decision = case
        when action in ('buy', 'sell') then 'execute' else 'not-required' end,
      estimated_costs =
        '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb,
      tax_lot_snapshot = '[]'::jsonb,
      estimated_cost_basis = 0
    where run_id = run.id;
    return;
  elsif p9_item_count <> item_count then
    raise exception 'every plan item must contain complete P9 cost evidence'
      using errcode = '22023';
  end if;

  snapshot := jsonb_build_object(
    'commissionFixedUsd', round(policy.commission_fixed_usd, 2),
    'commissionBps', round(policy.commission_bps, 4),
    'buySlippageBps', round(policy.buy_slippage_bps, 4),
    'sellSlippageBps', round(policy.sell_slippage_bps, 4),
    'sellTransactionTaxBps', round(policy.sell_transaction_tax_bps, 4),
    'capitalGainsTaxPct', policy.capital_gains_tax_pct,
    'maxCostPct', policy.max_cost_pct,
    'taxLotMethod', 'fifo'
  );

  for input_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(input_item) <> 'object'
      or jsonb_typeof(input_item->'requestedTradeValue') <> 'number'
      or jsonb_typeof(input_item->'optimizationDecision') <> 'string'
      or not public.p9_cost_breakdown_is_valid(input_item->'estimatedCosts', false)
      or jsonb_typeof(input_item->'taxLotSnapshot') <> 'array'
      or jsonb_typeof(input_item->'estimatedCostBasis') <> 'number' then
      raise exception 'invalid P9 plan item evidence' using errcode = '22023';
    end if;

    select * into stored_item from public.portfolio_rebalance_items
    where run_id = run.id and symbol = upper(trim(input_item->>'symbol'))
    for update;
    if not found then
      raise exception 'P9 plan item does not match the persisted plan'
        using errcode = '22023';
    end if;
    matched_count := matched_count + 1;

    requested_value := round((input_item->>'requestedTradeValue')::numeric, 8);
    trade_value_value := round((input_item->>'tradeValue')::numeric, 8);
    estimated_basis := round((input_item->>'estimatedCostBasis')::numeric, 8);
    decision := input_item->>'optimizationDecision';
    costs := input_item->'estimatedCosts';
    lots := input_item->'taxLotSnapshot';

    if requested_value < 0 or round(requested_value, 2) <> requested_value
      or trade_value_value is distinct from stored_item.trade_value
      or round(trade_value_value, 2) <> trade_value_value
      or estimated_basis < 0 or round(estimated_basis, 2) <> estimated_basis
      or decision not in (
        'execute', 'not-required', 'below-minimum', 'cost-inefficient',
        'cash-limited', 'invalid-tax-lots'
      )
      or (stored_item.action = 'sell' and decision <> 'execute')
      or (stored_item.action = 'buy' and decision not in ('execute', 'cash-limited'))
      or (stored_item.action = 'hold' and decision = 'execute')
      or trade_value_value > requested_value + 0.00000001
      or (stored_item.action in ('buy', 'sell') and trade_value_value <= 0)
      or (stored_item.action = 'sell' and trade_value_value <> requested_value)
      or (stored_item.action = 'buy' and decision = 'execute'
        and trade_value_value <> requested_value)
      or (stored_item.action = 'buy' and decision = 'cash-limited'
        and trade_value_value >= requested_value)
      or (stored_item.action = 'hold' and trade_value_value <> 0) then
      raise exception 'P9 optimization decision is inconsistent with the order'
        using errcode = '22023';
    end if;

    if stored_item.action = 'sell' then
      if jsonb_array_length(lots) < 1 or stored_item.estimated_quantity is null then
        raise exception 'sell orders require immutable FIFO lot evidence'
          using errcode = '22023';
      end if;
      lot_quantity := 0;
      lot_basis := 0;
      previous_acquired_at := null;
      expected_lots := public.p9_current_fifo_lots(
        p_user_id, run.portfolio_id, stored_item.symbol,
        stored_item.estimated_quantity
      );
      if expected_lots is null
        or jsonb_array_length(expected_lots) <> jsonb_array_length(lots) then
        raise exception 'FIFO lot evidence does not match the currently open ledger lots'
          using errcode = '22023';
      end if;
      for lot_record in
        select value as lot, ordinality
        from jsonb_array_elements(lots) with ordinality
        order by ordinality
      loop
        lot := lot_record.lot;
        if jsonb_typeof(lot) <> 'object'
          or jsonb_typeof(lot->'transactionId') <> 'string'
          or coalesce(lot->>'transactionId', '') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or jsonb_typeof(lot->'acquiredAt') <> 'string'
          or jsonb_typeof(lot->'quantity') <> 'number'
          or jsonb_typeof(lot->'unitCost') <> 'number'
          or jsonb_typeof(lot->'costBasis') <> 'number'
          or (lot->>'quantity')::numeric <= 0
          or (lot->>'unitCost')::numeric < 0
          or (lot->>'costBasis')::numeric < 0
          or abs(
            floor((lot->>'quantity')::numeric * (lot->>'unitCost')::numeric * 100) / 100
            - round((lot->>'costBasis')::numeric, 8)
          ) > 0.00000001 then
          raise exception 'invalid FIFO lot slice' using errcode = '22023';
        end if;

        expected_lot := expected_lots->((lot_record.ordinality - 1)::integer);
        if expected_lot is null
          or lot->>'transactionId' is distinct from expected_lot->>'transactionId'
          or (lot->>'acquiredAt')::timestamptz is distinct from
            (expected_lot->>'acquiredAt')::timestamptz
          or abs(
            round((lot->>'quantity')::numeric, 12)
            - round((expected_lot->>'quantity')::numeric, 12)
          ) > 0.000000001
          or abs(
            round((lot->>'unitCost')::numeric, 8)
            - round((expected_lot->>'unitCost')::numeric, 8)
          ) > 0.00000001
          or abs(
            round((lot->>'costBasis')::numeric, 2)
            - round((expected_lot->>'costBasis')::numeric, 2)
          ) > 0.00000001 then
          raise exception 'FIFO lot evidence must consume the earliest open lots'
            using errcode = '22023';
        end if;

        if previous_acquired_at is not null
          and (lot->>'acquiredAt')::timestamptz < previous_acquired_at then
          raise exception 'FIFO lot slices must be ordered by acquisition time'
            using errcode = '22023';
        end if;
        previous_acquired_at := (lot->>'acquiredAt')::timestamptz;

        select source.* into source_transaction
        from public.portfolio_transactions source
        where source.id = (lot->>'transactionId')::uuid
          and source.portfolio_id = run.portfolio_id and source.user_id = p_user_id
          and source.kind = 'buy' and source.symbol = stored_item.symbol
          and not exists (
            select 1 from public.portfolio_transactions reversal
            where reversal.reversal_of = source.id
          );
        if not found
          or source_transaction.trade_at is distinct from (lot->>'acquiredAt')::timestamptz
          or abs(
            round(
              (round(source_transaction.quantity * source_transaction.price, 8)
                + source_transaction.fees)
              / source_transaction.quantity,
              8
            ) - round((lot->>'unitCost')::numeric, 8)
          ) > 0.01
          or (lot->>'quantity')::numeric > source_transaction.quantity + 0.000000000001 then
          raise exception 'FIFO lot evidence does not match the active ledger'
            using errcode = '22023';
        end if;
        lot_quantity := lot_quantity + (lot->>'quantity')::numeric;
        lot_basis := lot_basis + (lot->>'costBasis')::numeric;
      end loop;
      if abs(round(lot_quantity, 12) - stored_item.estimated_quantity) > 0.000000000001
        or abs(round(lot_basis, 8) - estimated_basis) > 0.01
        or (
          select count(distinct value->>'transactionId') <> jsonb_array_length(lots)
          from jsonb_array_elements(lots)
        ) then
        raise exception 'FIFO slices do not cover the proposed sell quantity'
          using errcode = '22023';
      end if;
    elsif jsonb_array_length(lots) <> 0 or estimated_basis <> 0 then
      raise exception 'buy and hold items cannot carry FIFO sell evidence'
        using errcode = '22023';
    end if;

    if stored_item.action in ('buy', 'sell') then
      expected_slippage := ceil((
        trade_value_value * case when stored_item.action = 'buy'
          then round(policy.buy_slippage_bps, 4)
          else round(policy.sell_slippage_bps, 4) end / 10000
      ) * 100) / 100;
      execution_notional := case when stored_item.action = 'buy' then
        round(trade_value_value + expected_slippage, 2)
        else greatest(round(trade_value_value - expected_slippage, 2), 0) end;
      expected_commission := case when execution_notional > 0 then
        round(policy.commission_fixed_usd, 2)
        + ceil((execution_notional * round(policy.commission_bps, 4) / 10000) * 100) / 100
        else 0 end;
      expected_transaction_tax := case when stored_item.action = 'sell' then
        ceil((execution_notional * round(policy.sell_transaction_tax_bps, 4) / 10000) * 100) / 100
        else 0 end;
      expected_taxable_gain := case when stored_item.action = 'sell' then
        greatest(
          execution_notional - expected_commission
          - expected_transaction_tax - estimated_basis,
          0
        )
        else 0 end;
      expected_capital_tax := case when stored_item.action = 'sell' then
        ceil((expected_taxable_gain * round(policy.capital_gains_tax_pct, 4) / 100) * 100) / 100
        else 0 end;
      expected_tax := round(expected_transaction_tax + expected_capital_tax, 2);
      expected_total := round(
        expected_commission + expected_slippage + expected_tax,
        2
      );
      expected_net_cash := case when stored_item.action = 'buy' then
        -round(execution_notional + expected_commission, 2)
        else round(execution_notional - expected_commission, 2) end;
    else
      expected_commission := 0;
      expected_slippage := 0;
      expected_transaction_tax := 0;
      expected_taxable_gain := 0;
      expected_capital_tax := 0;
      expected_tax := 0;
      expected_total := 0;
      expected_net_cash := 0;
    end if;

    if abs(public.p9_cost_number(costs, 'commission') - expected_commission) > 0.00000001
      or abs(public.p9_cost_number(costs, 'slippage') - expected_slippage) > 0.00000001
      or abs(public.p9_cost_number(costs, 'transactionTax') - expected_transaction_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'capitalGainsTax') - expected_capital_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'tax') - expected_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'taxableGain') - expected_taxable_gain) > 0.00000001
      or abs(public.p9_cost_number(costs, 'total') - expected_total) > 0.00000001
      or abs(public.p9_cost_number(costs, 'netCashEffect') - expected_net_cash) > 0.00000001 then
      raise exception 'estimated order costs do not match the persisted policy'
        using errcode = '22023';
    end if;
    if stored_item.action in ('buy', 'sell') and (
      trade_value_value <= 0
      or expected_total * 100 > trade_value_value * round(policy.max_cost_pct, 4) + 0.00000001
    ) then
      raise exception 'estimated order cost exceeds the configured maximum'
        using errcode = 'P0001';
    end if;

    update public.portfolio_rebalance_items set
      requested_trade_value = requested_value,
      optimization_decision = decision,
      estimated_costs = jsonb_build_object(
        'commission', expected_commission,
        'slippage', expected_slippage,
        'transactionTax', expected_transaction_tax,
        'capitalGainsTax', expected_capital_tax,
        'tax', expected_tax,
        'taxableGain', expected_taxable_gain,
        'total', expected_total,
        'netCashEffect', expected_net_cash
      ),
      tax_lot_snapshot = lots,
      estimated_cost_basis = estimated_basis
    where id = stored_item.id;

    total_commission := total_commission + expected_commission;
    total_slippage := total_slippage + expected_slippage;
    total_transaction_tax := total_transaction_tax + expected_transaction_tax;
    total_capital_tax := total_capital_tax + expected_capital_tax;
    total_tax := total_tax + expected_tax;
    total_taxable_gain := total_taxable_gain + expected_taxable_gain;
    total_cost := total_cost + expected_total;
    total_net_cash := total_net_cash + expected_net_cash;
  end loop;

  if matched_count <> item_count then
    raise exception 'P9 plan cost evidence is incomplete' using errcode = '22023';
  end if;

  -- Sell taxes are a reserve, not a ledger debit, so the durable P7 cash
  -- estimate is spendable execution cash after reserving estimated tax.
  -- P8 cannot contain sells and therefore has a zero tax reserve.
  expected_cash := run.cash_balance + total_net_cash - total_tax + case
    when run.plan_kind = 'contribution' then coalesce(run.contribution_amount, 0)
    else 0 end;
  if expected_cash < -0.00000001 or coalesce(p_expected_cash_after, -1) < 0
    or abs(round(expected_cash, 8) - round(p_expected_cash_after, 8)) > 0.01 then
    raise exception 'estimated cash does not include the persisted order costs'
      using errcode = '22023';
  end if;

  update public.portfolio_rebalance_runs set
    cost_model_version = 1,
    cost_policy_snapshot = snapshot,
    estimated_cash_after = round(p_expected_cash_after, 8),
    updated_at = timezone('utc', now())
  where id = run.id;

  update public.portfolio_rebalance_events set
    details = details || jsonb_build_object(
      'costModelVersion', 1,
      'costPolicySnapshot', snapshot,
      'estimatedCosts', jsonb_build_object(
        'commission', round(total_commission, 2),
        'slippage', round(total_slippage, 2),
        'transactionTax', round(total_transaction_tax, 2),
        'capitalGainsTax', round(total_capital_tax, 2),
        'tax', round(total_tax, 2),
        'taxableGain', round(total_taxable_gain, 2),
        'total', round(total_cost, 2),
        'netCashEffect', round(total_net_cash, 2)
      )
    )
  where run_id = run.id and event = 'created';
end;
$$;
revoke all on function public.apply_p9_plan_costs(uuid, uuid, jsonb, numeric)
  from public, anon, authenticated, service_role;

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
  result jsonb;
begin
  result := public.create_portfolio_rebalance_run_p8(
    p_user_id, p_portfolio_id, p_source, p_plan_hash, p_policy_updated_at,
    p_portfolio_updated_at, p_valuation_as_of, p_valuation_quality,
    p_total_value, p_cash_balance, p_drift_threshold_pct, p_min_trade_value,
    p_max_drift_pct, p_estimated_cash_after, p_expires_at, p_items,
    p_idempotency_key, p_request_hash
  );
  if coalesce((result->>'created')::boolean, false) then
    perform public.apply_p9_plan_costs(
      p_user_id, (result->>'runId')::uuid, p_items, p_estimated_cash_after
    );
  end if;
  return result;
end;
$$;
revoke all on function public.create_portfolio_rebalance_run(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz,
  jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_portfolio_rebalance_run(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, timestamptz,
  jsonb, text, text
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
  result jsonb;
begin
  -- The P8 primitive validates its original gross-notional cash contract. P9
  -- validates the caller's cost-aware cash result and restores it atomically
  -- after the primitive has inserted the run and items.
  result := public.create_portfolio_contribution_run_p8(
    p_user_id, p_portfolio_id, p_goal_id, p_source, p_scheduled_for,
    p_plan_hash, p_goal_updated_at, p_policy_updated_at,
    p_portfolio_updated_at, p_valuation_as_of, p_valuation_quality,
    p_total_value, p_cash_balance, p_contribution_amount, p_min_trade_value,
    p_max_drift_pct, p_cash_remainder,
    round(p_cash_balance + p_cash_remainder, 8),
    p_expires_at, p_items, p_idempotency_key, p_request_hash
  );
  if coalesce((result->>'created')::boolean, false) then
    perform public.apply_p9_plan_costs(
      p_user_id, (result->>'runId')::uuid, p_items, p_estimated_cash_after
    );
  end if;
  return result;
end;
$$;
revoke all on function public.create_portfolio_contribution_run(
  uuid, uuid, uuid, text, date, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, timestamptz, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_portfolio_contribution_run(
  uuid, uuid, uuid, text, date, text, timestamptz, timestamptz,
  timestamptz, timestamptz, text, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, timestamptz, jsonb, text, text
) to service_role;

create or replace function public.validate_p9_actual_costs(
  p_user_id uuid,
  p_run_id uuid,
  p_plan_kind text,
  p_fills jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.portfolio_rebalance_runs%rowtype;
  item public.portfolio_rebalance_items%rowtype;
  fill jsonb;
  costs jsonb;
  canonical jsonb;
  entries jsonb := '[]'::jsonb;
  expected_count integer;
  fill_count integer;
  unique_count integer;
  validated_count integer := 0;
  quantity_value numeric(28, 12);
  price_value numeric(28, 8);
  fee_value numeric(28, 8);
  actual_commission numeric(28, 8);
  actual_notional numeric(28, 8);
  cost_limit_notional numeric(28, 8);
  actual_basis numeric(28, 8);
  raw_slippage numeric;
  expected_slippage numeric(28, 8);
  expected_transaction_tax numeric(28, 8);
  expected_taxable_gain numeric(28, 8);
  expected_capital_tax numeric(28, 8);
  expected_tax numeric(28, 8);
  expected_total numeric(28, 8);
  expected_net_cash numeric(28, 8);
  economic_cost numeric(28, 8);
  raw_cash_effect numeric;
  total_commission numeric := 0;
  total_slippage numeric := 0;
  total_transaction_tax numeric := 0;
  total_capital_tax numeric := 0;
  total_tax numeric := 0;
  total_taxable_gain numeric := 0;
  total_cost numeric := 0;
  total_net_cash numeric := 0;
  total_raw_cash_effect numeric := 0;
  sell_transaction_tax_bps numeric;
  capital_gains_tax_pct numeric;
  max_cost_pct numeric;
  required_cash_reserve numeric := 0;
  planned_cash_reserve numeric := 0;
begin
  select * into run from public.portfolio_rebalance_runs
  where id = p_run_id and user_id = p_user_id and plan_kind = p_plan_kind
  for update;
  if not found then
    raise exception 'investment plan not found' using errcode = 'P0002';
  end if;
  if run.status <> 'approved' then
    raise exception 'only approved investment plans can be completed'
      using errcode = 'P0001';
  end if;
  if p_fills is null or jsonb_typeof(p_fills) <> 'array' then
    raise exception 'fills must be an array' using errcode = '22023';
  end if;

  fill_count := jsonb_array_length(p_fills);
  select count(*) into expected_count from public.portfolio_rebalance_items
  where run_id = run.id and action in ('buy', 'sell');
  select count(distinct value->>'itemId') into unique_count
  from jsonb_array_elements(p_fills);
  if fill_count <> expected_count or unique_count <> expected_count then
    raise exception 'exactly one fill is required for every proposed order'
      using errcode = '22023';
  end if;

  if run.cost_model_version = 0 then
    return jsonb_build_object(
      'legacy', true,
      'entries', '[]'::jsonb,
      'totals',
        '{"commission":0,"slippage":0,"transactionTax":0,"capitalGainsTax":0,"tax":0,"taxableGain":0,"total":0,"netCashEffect":0}'::jsonb
    );
  end if;
  if run.cost_model_version <> 1
    or jsonb_typeof(run.cost_policy_snapshot) <> 'object'
    or run.cost_policy_snapshot->>'taxLotMethod' <> 'fifo' then
    raise exception 'P9 cost policy snapshot is missing' using errcode = 'P0001';
  end if;

  sell_transaction_tax_bps := public.p9_cost_number(
    run.cost_policy_snapshot, 'sellTransactionTaxBps'
  );
  capital_gains_tax_pct := public.p9_cost_number(
    run.cost_policy_snapshot, 'capitalGainsTaxPct'
  );
  max_cost_pct := public.p9_cost_number(run.cost_policy_snapshot, 'maxCostPct');
  if sell_transaction_tax_bps is null
    or sell_transaction_tax_bps < 0 or sell_transaction_tax_bps > 10000
    or capital_gains_tax_pct is null
    or capital_gains_tax_pct < 0 or capital_gains_tax_pct > 100
    or max_cost_pct is null or max_cost_pct < 0 or max_cost_pct > 100 then
    raise exception 'P9 cost policy snapshot is invalid' using errcode = 'P0001';
  end if;

  for fill in select value from jsonb_array_elements(p_fills)
  loop
    if jsonb_typeof(fill) <> 'object'
      or jsonb_typeof(fill->'itemId') <> 'string'
      or coalesce(fill->>'itemId', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(fill->'quantity') <> 'number'
      or jsonb_typeof(fill->'price') <> 'number'
      or jsonb_typeof(fill->'fees') <> 'number'
      or not public.p9_cost_breakdown_is_valid(fill->'actualCosts', true) then
      raise exception 'invalid P9 fill cost evidence' using errcode = '22023';
    end if;

    select * into item from public.portfolio_rebalance_items
    where id = (fill->>'itemId')::uuid and run_id = run.id
      and action in ('buy', 'sell')
    for update;
    if not found then
      raise exception 'P9 fill does not match a proposed order'
        using errcode = '22023';
    end if;
    quantity_value := round((fill->>'quantity')::numeric, 12);
    price_value := round((fill->>'price')::numeric, 8);
    fee_value := round((fill->>'fees')::numeric, 8);
    costs := fill->'actualCosts';
    if quantity_value <= 0 or price_value <= 0 or fee_value < 0
      or item.reference_price is null or item.reference_price <= 0
      or item.estimated_quantity is null
      or quantity_value > item.estimated_quantity + 0.000000001 then
      raise exception 'actual fill exceeds the approved order quantity'
        using errcode = 'P0001';
    end if;
    actual_notional := case when item.action = 'buy' then
      ceil(quantity_value * price_value * 100) / 100
      else floor(quantity_value * price_value * 100) / 100 end;
    actual_commission := ceil(fee_value * 100) / 100;
    raw_slippage := case when item.action = 'buy' then
      (price_value - item.reference_price) * quantity_value
      else (item.reference_price - price_value) * quantity_value end;
    -- Positive adverse execution is rounded up; negative price improvement is
    -- rounded toward zero by the same ceil operation.
    expected_slippage := ceil(raw_slippage * 100) / 100;
    expected_transaction_tax := case
      when p_plan_kind = 'rebalance' and item.action = 'sell' then
        ceil((actual_notional * sell_transaction_tax_bps / 10000) * 100) / 100
      else 0 end;
    actual_basis := case when p_plan_kind = 'rebalance' and item.action = 'sell'
      then public.p9_fifo_cost_basis(item.tax_lot_snapshot, quantity_value)
      else 0 end;
    if actual_basis is null then
      raise exception 'actual sell quantity is not covered by immutable FIFO lots'
        using errcode = 'P0001';
    end if;
    expected_taxable_gain := case
      when p_plan_kind = 'rebalance' and item.action = 'sell' then
        ceil(greatest(
          actual_notional - actual_commission - expected_transaction_tax - actual_basis,
          0
        ) * 100) / 100
      else 0 end;
    expected_capital_tax := case
      when p_plan_kind = 'rebalance' and item.action = 'sell' then
        ceil((expected_taxable_gain * capital_gains_tax_pct / 100) * 100) / 100
      else 0 end;
    expected_tax := round(expected_transaction_tax + expected_capital_tax, 2);
    expected_total := round(actual_commission + expected_slippage + expected_tax, 2);
    expected_net_cash := case when item.action = 'buy' then
      -round(actual_notional + actual_commission, 2)
      else round(actual_notional - actual_commission, 2) end;
    raw_cash_effect := case when item.action = 'buy' then
      -(quantity_value * price_value + fee_value)
      else quantity_value * price_value - fee_value end;
    economic_cost := round(
      actual_commission + greatest(expected_slippage, 0)
      + expected_transaction_tax + expected_capital_tax,
      2
    );
    -- Both execution workflows protect against economic cost as a share of the
    -- user's raw actual fill notional. Cost evidence itself retains the
    -- conservative action-specific cent envelope above.
    cost_limit_notional := quantity_value * price_value;

    if abs(public.p9_cost_number(costs, 'commission') - actual_commission) > 0.00000001
      or abs(public.p9_cost_number(costs, 'slippage') - expected_slippage) > 0.00000001
      or abs(public.p9_cost_number(costs, 'transactionTax') - expected_transaction_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'capitalGainsTax') - expected_capital_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'tax') - expected_tax) > 0.00000001
      or abs(public.p9_cost_number(costs, 'taxableGain') - expected_taxable_gain) > 0.00000001
      or abs(public.p9_cost_number(costs, 'total') - expected_total) > 0.00000001
      or abs(public.p9_cost_number(costs, 'netCashEffect') - expected_net_cash) > 0.00000001 then
      raise exception 'actual order costs do not match fill, FIFO lots and policy'
        using errcode = '22023';
    end if;
    if cost_limit_notional <= 0
      or economic_cost * 100 > cost_limit_notional * max_cost_pct + 0.000001 then
      raise exception 'actual order cost exceeds the configured maximum'
        using errcode = 'P0001';
    end if;

    canonical := jsonb_build_object(
      'commission', actual_commission,
      'slippage', expected_slippage,
      'transactionTax', expected_transaction_tax,
      'capitalGainsTax', expected_capital_tax,
      'tax', expected_tax,
      'taxableGain', expected_taxable_gain,
      'total', expected_total,
      'netCashEffect', expected_net_cash
    );
    entries := entries || jsonb_build_array(jsonb_build_object(
      'itemId', item.id,
      'actualCosts', canonical
    ));
    total_commission := total_commission + actual_commission;
    total_slippage := total_slippage + expected_slippage;
    total_transaction_tax := total_transaction_tax + expected_transaction_tax;
    total_capital_tax := total_capital_tax + expected_capital_tax;
    total_tax := total_tax + expected_tax;
    total_taxable_gain := total_taxable_gain + expected_taxable_gain;
    total_cost := total_cost + expected_total;
    total_net_cash := total_net_cash + expected_net_cash;
    total_raw_cash_effect := total_raw_cash_effect + raw_cash_effect;
    validated_count := validated_count + 1;
  end loop;

  if validated_count <> expected_count then
    raise exception 'P9 fill cost evidence is incomplete' using errcode = '22023';
  end if;

  if p_plan_kind = 'rebalance' then
    select coalesce(max(target_value), 0) into required_cash_reserve
    from public.portfolio_rebalance_items
    where run_id = run.id and symbol = 'CASH';
    if run.cash_balance + total_raw_cash_effect - total_tax
      < required_cash_reserve - 0.01 then
      raise exception 'actual execution cannot preserve the cash and tax reserve'
        using errcode = 'P0001';
    end if;
  elsif p_plan_kind = 'contribution' then
    planned_cash_reserve := greatest(run.estimated_cash_after - run.cash_balance, 0);
    if coalesce(run.contribution_amount, 0) + total_raw_cash_effect + 0.000001
      < planned_cash_reserve then
      raise exception 'actual contribution cannot preserve the planned cash reserve'
        using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object(
    'legacy', false,
    'entries', entries,
    'totals', jsonb_build_object(
      'commission', round(total_commission, 2),
      'slippage', round(total_slippage, 2),
      'transactionTax', round(total_transaction_tax, 2),
      'capitalGainsTax', round(total_capital_tax, 2),
      'tax', round(total_tax, 2),
      'taxableGain', round(total_taxable_gain, 2),
      'total', round(total_cost, 2),
      'netCashEffect', round(total_net_cash, 2)
    )
  );
end;
$$;
revoke all on function public.validate_p9_actual_costs(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.persist_p9_actual_costs(
  p_user_id uuid,
  p_run_id uuid,
  p_idempotency_key text,
  p_validated jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  updated_count integer := 0;
  expected_count integer;
begin
  if coalesce((p_validated->>'legacy')::boolean, false) then return; end if;
  if jsonb_typeof(p_validated->'entries') <> 'array'
    or not public.p9_cost_breakdown_is_valid(p_validated->'totals', true) then
    raise exception 'validated P9 execution evidence is malformed'
      using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(p_validated->'entries')
  loop
    update public.portfolio_rebalance_fills set
      actual_costs = entry->'actualCosts'
    where run_id = p_run_id and user_id = p_user_id
      and item_id = (entry->>'itemId')::uuid;
    if not found then
      raise exception 'completed fill was not found for P9 evidence'
        using errcode = 'P0002';
    end if;
    updated_count := updated_count + 1;
  end loop;
  select count(*) into expected_count from public.portfolio_rebalance_fills
  where run_id = p_run_id and user_id = p_user_id;
  if updated_count <> expected_count then
    raise exception 'P9 execution evidence does not cover every completed fill'
      using errcode = '22023';
  end if;
  update public.portfolio_rebalance_events set
    details = details || jsonb_build_object(
      'costModelVersion', 1,
      'actualCosts', p_validated->'totals',
      'taxTreatment', 'estimate-only-not-posted-to-ledger'
    )
  where run_id = p_run_id and user_id = p_user_id
    and event = 'completed' and idempotency_key = p_idempotency_key;
  if not found then
    raise exception 'completed audit event was not found for P9 evidence'
      using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.persist_p9_actual_costs(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

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
  existing public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  validated jsonb;
  updated_id uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
  );
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'rebalance'
      or existing.request_hash is distinct from p_request_hash
      or existing.event <> 'completed' then
      raise exception 'idempotency key belongs to a different request or plan kind'
        using errcode = '22023';
    end if;
    return existing.run_id;
  end if;

  validated := public.validate_p9_actual_costs(
    p_user_id, p_run_id, 'rebalance', p_fills
  );
  updated_id := public.complete_portfolio_rebalance_run_p8(
    p_user_id, p_run_id, p_fills, p_idempotency_key, p_request_hash
  );
  if updated_id is distinct from p_run_id then
    raise exception 'completed rebalance id does not match request'
      using errcode = '22023';
  end if;
  perform public.persist_p9_actual_costs(
    p_user_id, p_run_id, p_idempotency_key, validated
  );
  return updated_id;
end;
$$;
revoke all on function public.complete_portfolio_rebalance_run(
  uuid, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.complete_portfolio_rebalance_run(
  uuid, uuid, jsonb, text, text
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
  existing public.portfolio_rebalance_events%rowtype;
  existing_kind text;
  validated jsonb;
  updated_id uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid idempotency input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
  );
  select * into existing from public.portfolio_rebalance_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select plan_kind into existing_kind from public.portfolio_rebalance_runs
    where id = existing.run_id and user_id = p_user_id;
    if existing_kind is distinct from 'contribution'
      or existing.request_hash is distinct from p_request_hash
      or existing.event <> 'completed' then
      raise exception 'idempotency key belongs to a different request or plan kind'
        using errcode = '22023';
    end if;
    return existing.run_id;
  end if;

  validated := public.validate_p9_actual_costs(
    p_user_id, p_run_id, 'contribution', p_fills
  );
  updated_id := public.complete_portfolio_contribution_run_p8(
    p_user_id, p_run_id, p_deposit_at, p_fills,
    p_idempotency_key, p_request_hash
  );
  if updated_id is distinct from p_run_id then
    raise exception 'completed contribution id does not match request'
      using errcode = '22023';
  end if;
  perform public.persist_p9_actual_costs(
    p_user_id, p_run_id, p_idempotency_key, validated
  );
  return updated_id;
end;
$$;
revoke all on function public.complete_portfolio_contribution_run(
  uuid, uuid, timestamptz, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.complete_portfolio_contribution_run(
  uuid, uuid, timestamptz, jsonb, text, text
) to service_role;

-- Reassert the established table boundary after adding the P9 evidence columns.
-- Authenticated users and the service role may read their existing RLS-scoped
-- rows; only the SECURITY DEFINER RPCs above may mutate workflow evidence.
revoke all on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills from anon;
revoke all on public.portfolio_allocation_policies from anon;
revoke insert, update, delete on public.portfolio_rebalance_runs,
  public.portfolio_rebalance_items, public.portfolio_rebalance_fills
  from authenticated, service_role;
revoke insert, update, delete on public.portfolio_allocation_policies
  from authenticated, service_role;
grant select on public.portfolio_rebalance_runs, public.portfolio_rebalance_items,
  public.portfolio_rebalance_fills to authenticated, service_role;
grant select on public.portfolio_allocation_policies to authenticated, service_role;
