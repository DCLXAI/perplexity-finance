-- Perplexity Finance v1.3.0: user state, durable alerts, delivery queue, AI audit.
create extension if not exists pgcrypto;
create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_at=timezone('utc',now()); return new; end; $$;

create table if not exists public.watchlists(
  user_id uuid primary key references auth.users(id) on delete cascade,
  symbols text[] not null default '{}', created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()),
  constraint watchlists_max_symbols check(cardinality(symbols)<=100)
);
create table if not exists public.price_alerts(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check(symbol~'^[A-Z0-9./-]{1,20}$'), condition text not null check(condition in('above','below')),
  target numeric not null check(target>0), baseline numeric not null check(baseline>0), last_observed_price numeric,
  state text not null default 'armed' check(state in('armed','triggered','disabled')), email_enabled boolean not null default false, push_enabled boolean not null default false,
  seen boolean not null default true, triggered_at timestamptz, triggered_price numeric, triggered_provenance jsonb,
  created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists price_alerts_user_created_idx on public.price_alerts(user_id,created_at desc);
create index if not exists price_alerts_armed_idx on public.price_alerts(state,symbol) where state='armed';
create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, expires_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create table if not exists public.alert_deliveries(
  id uuid primary key default gen_random_uuid(), alert_id uuid not null references public.price_alerts(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in('email','push')), status text not null default 'pending' check(status in('pending','processing','retry','sent','failed','disabled')),
  attempts integer not null default 0 check(attempts>=0), next_attempt_at timestamptz not null default timezone('utc',now()), payload jsonb not null, last_error text, sent_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()), unique(alert_id,channel)
);
create index if not exists alert_deliveries_due_idx on public.alert_deliveries(status,next_attempt_at) where status in('pending','retry');
create table if not exists public.ai_audits(
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null, request_id text not null, model text not null,
  mode text not null check(mode in('openai','local-fallback')), tools_used text[] not null default '{}', sources jsonb not null default '[]'::jsonb,
  input_tokens integer not null default 0, output_tokens integer not null default 0, total_tokens integer not null default 0, created_at timestamptz not null default timezone('utc',now())
);
create index if not exists ai_audits_user_created_idx on public.ai_audits(user_id,created_at desc);

drop trigger if exists watchlists_set_updated_at on public.watchlists;
drop trigger if exists price_alerts_set_updated_at on public.price_alerts;
drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
drop trigger if exists alert_deliveries_set_updated_at on public.alert_deliveries;
create trigger watchlists_set_updated_at before update on public.watchlists for each row execute function public.set_updated_at();
create trigger price_alerts_set_updated_at before update on public.price_alerts for each row execute function public.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
create trigger alert_deliveries_set_updated_at before update on public.alert_deliveries for each row execute function public.set_updated_at();

alter table public.watchlists enable row level security; alter table public.price_alerts enable row level security; alter table public.push_subscriptions enable row level security; alter table public.alert_deliveries enable row level security; alter table public.ai_audits enable row level security;
drop policy if exists watchlists_select_own on public.watchlists;
drop policy if exists watchlists_insert_own on public.watchlists;
drop policy if exists watchlists_update_own on public.watchlists;
drop policy if exists watchlists_delete_own on public.watchlists;
drop policy if exists alerts_select_own on public.price_alerts;
drop policy if exists alerts_insert_own on public.price_alerts;
drop policy if exists alerts_update_own on public.price_alerts;
drop policy if exists alerts_delete_own on public.price_alerts;
drop policy if exists push_select_own on public.push_subscriptions;
drop policy if exists push_insert_own on public.push_subscriptions;
drop policy if exists push_update_own on public.push_subscriptions;
drop policy if exists push_delete_own on public.push_subscriptions;
drop policy if exists deliveries_select_own on public.alert_deliveries;
drop policy if exists ai_audits_select_own on public.ai_audits;

-- Browser clients can read their own state for Realtime visibility, but every
-- mutation must pass through the authenticated API, where symbols, baselines,
-- channels and rate limits are validated. The service_role bypasses RLS.
create policy watchlists_select_own on public.watchlists for select using((select auth.uid())=user_id);
create policy alerts_select_own on public.price_alerts for select using((select auth.uid())=user_id);
create policy push_select_own on public.push_subscriptions for select using((select auth.uid())=user_id);
create policy deliveries_select_own on public.alert_deliveries for select using((select auth.uid())=user_id);
create policy ai_audits_select_own on public.ai_audits for select using((select auth.uid())=user_id);

grant select on public.watchlists, public.price_alerts, public.push_subscriptions, public.alert_deliveries, public.ai_audits to authenticated;
revoke insert, update, delete on public.watchlists, public.price_alerts, public.push_subscriptions, public.alert_deliveries, public.ai_audits from anon, authenticated;

create or replace function public.claim_price_alert(p_alert_id uuid,p_price numeric,p_provenance jsonb) returns boolean language plpgsql security definer set search_path=public as $$ declare changed integer; begin update public.price_alerts set state='triggered',triggered_at=timezone('utc',now()),triggered_price=p_price,triggered_provenance=p_provenance,last_observed_price=p_price,seen=false where id=p_alert_id and state='armed'; get diagnostics changed=row_count; return changed=1; end; $$;
revoke all on function public.claim_price_alert(uuid,numeric,jsonb) from public; grant execute on function public.claim_price_alert(uuid,numeric,jsonb) to service_role;
create or replace function public.claim_due_deliveries(p_limit integer) returns setof public.alert_deliveries language plpgsql security definer set search_path=public as $$ begin
  update public.alert_deliveries set status='retry',next_attempt_at=timezone('utc',now()),last_error=coalesce(last_error,'Recovered stale processing lease') where status='processing' and updated_at<timezone('utc',now())-interval '10 minutes';
  return query with candidates as(select id from public.alert_deliveries where status in('pending','retry') and next_attempt_at<=timezone('utc',now()) order by next_attempt_at asc for update skip locked limit greatest(1,least(p_limit,500))) update public.alert_deliveries d set status='processing',attempts=d.attempts+1 from candidates c where d.id=c.id returning d.*;
end; $$;
revoke all on function public.claim_due_deliveries(integer) from public; grant execute on function public.claim_due_deliveries(integer) to service_role;

-- Realtime is optional; CloudSync also polls. Add only once.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='watchlists') then execute 'alter publication supabase_realtime add table public.watchlists'; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='price_alerts') then execute 'alter publication supabase_realtime add table public.price_alerts'; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='alert_deliveries') then execute 'alter publication supabase_realtime add table public.alert_deliveries'; end if;
  end if;
end $$;
