-- Perplexity Finance v1.4.0 P3 hardening:
-- atomic alert trigger+delivery enqueue and leased operations idempotency.

-- Triggering an alert and creating its delivery rows must commit together.
-- Returning JSON keeps the claim result extensible without exposing table rows.
create or replace function public.claim_price_alert_and_enqueue(
  p_alert_id uuid,
  p_price numeric,
  p_provenance jsonb,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.price_alerts%rowtype;
  changed integer := 0;
  enqueued integer := 0;
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
  where id = p_alert_id and state = 'armed'
  returning * into claimed;

  if not found then
    return jsonb_build_object('claimed', false, 'enqueued', 0);
  end if;

  if claimed.email_enabled then
    insert into public.alert_deliveries(alert_id, user_id, channel, payload, status)
    values (claimed.id, claimed.user_id, 'email', p_payload, 'pending')
    on conflict (alert_id, channel) do nothing;
    get diagnostics changed = row_count;
    enqueued := enqueued + changed;
  end if;

  if claimed.push_enabled then
    insert into public.alert_deliveries(alert_id, user_id, channel, payload, status)
    values (claimed.id, claimed.user_id, 'push', p_payload, 'pending')
    on conflict (alert_id, channel) do nothing;
    get diagnostics changed = row_count;
    enqueued := enqueued + changed;
  end if;

  return jsonb_build_object('claimed', true, 'enqueued', enqueued);
end;
$$;
revoke all on function public.claim_price_alert_and_enqueue(uuid, numeric, jsonb, jsonb) from public;
grant execute on function public.claim_price_alert_and_enqueue(uuid, numeric, jsonb, jsonb) to service_role;

-- Convert the P3 action result cache into an execution lease. Existing rows
-- remain completed results; new requests must atomically claim before work.
alter table public.ops_action_idempotency
  add column if not exists status text not null default 'completed',
  add column if not exists owner_request_id text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.ops_action_idempotency
  alter column response set default '{}'::jsonb;

DO $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ops_action_idempotency_status_check'
      and conrelid = 'public.ops_action_idempotency'::regclass
  ) then
    alter table public.ops_action_idempotency
      add constraint ops_action_idempotency_status_check
      check(status in ('processing', 'completed'));
  end if;
end;
$$;

drop trigger if exists ops_action_idempotency_set_updated_at on public.ops_action_idempotency;
create trigger ops_action_idempotency_set_updated_at
  before update on public.ops_action_idempotency
  for each row execute function public.set_updated_at();

create or replace function public.claim_ops_action(
  p_idempotency_key text,
  p_action text,
  p_request_id text,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer := 0;
  existing public.ops_action_idempotency%rowtype;
  lease_until timestamptz;
begin
  lease_until := timezone('utc', now())
    + make_interval(secs => greatest(30, least(p_lease_seconds, 900)));

  insert into public.ops_action_idempotency(
    idempotency_key, action, response, status, owner_request_id, expires_at
  ) values (
    p_idempotency_key, p_action, '{}'::jsonb, 'processing', p_request_id, lease_until
  ) on conflict (idempotency_key, action) do nothing;
  get diagnostics changed = row_count;
  if changed = 1 then
    return jsonb_build_object('state', 'claimed');
  end if;

  select * into existing
  from public.ops_action_idempotency
  where idempotency_key = p_idempotency_key and action = p_action
  for update;

  if existing.status = 'completed' and existing.expires_at > timezone('utc', now()) then
    return jsonb_build_object('state', 'completed', 'response', existing.response);
  end if;

  if existing.expires_at <= timezone('utc', now()) then
    update public.ops_action_idempotency
    set response = '{}'::jsonb,
        status = 'processing',
        owner_request_id = p_request_id,
        expires_at = lease_until
    where idempotency_key = p_idempotency_key
      and action = p_action
      and expires_at <= timezone('utc', now());
    get diagnostics changed = row_count;
    if changed = 1 then
      return jsonb_build_object('state', 'claimed');
    end if;
  end if;

  return jsonb_build_object(
    'state', 'in-progress',
    'retryAt', existing.expires_at
  );
end;
$$;
revoke all on function public.claim_ops_action(text, text, text, integer) from public;
grant execute on function public.claim_ops_action(text, text, text, integer) to service_role;

create or replace function public.complete_ops_action(
  p_idempotency_key text,
  p_action text,
  p_request_id text,
  p_response jsonb,
  p_retention_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.ops_action_idempotency
  set response = p_response,
      status = 'completed',
      expires_at = timezone('utc', now())
        + make_interval(secs => greatest(300, least(p_retention_seconds, 604800)))
  where idempotency_key = p_idempotency_key
    and action = p_action
    and status = 'processing'
    and owner_request_id = p_request_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.complete_ops_action(text, text, text, jsonb, integer) from public;
grant execute on function public.complete_ops_action(text, text, text, jsonb, integer) to service_role;

create or replace function public.release_ops_action(
  p_idempotency_key text,
  p_action text,
  p_request_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  delete from public.ops_action_idempotency
  where idempotency_key = p_idempotency_key
    and action = p_action
    and status = 'processing'
    and owner_request_id = p_request_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.release_ops_action(text, text, text) from public;
grant execute on function public.release_ops_action(text, text, text) to service_role;
