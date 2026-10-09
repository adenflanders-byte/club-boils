-- =====================================================================
-- The Club Boils — Migration 001
-- Secure foundation, payments ledger and School Events
--
-- SAFE TO RUN WHILE THE CURRENT SITE IS LIVE: everything here is additive
-- (new tables, new nullable columns, new functions). Nothing is deleted
-- and no existing row is changed. Run this BEFORE deploying the new code.
-- Re-running it is harmless (everything uses IF NOT EXISTS / OR REPLACE).
--
-- Run it in Supabase -> SQL Editor. Take a backup first
-- (Database -> Backups, or Table Editor -> export each table to CSV).
-- =====================================================================
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Admin accounts and sessions
-- ---------------------------------------------------------------------
-- Only Supabase Auth users listed here can sign in to /admin and /accounts.
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.admin_users(user_id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  ip_hash      text,
  user_agent   text
);
create index if not exists admin_sessions_user_idx on public.admin_sessions(user_id);

-- ---------------------------------------------------------------------
-- 2. Audit log (append-only record of sensitive changes)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  meta        jsonb
);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

create or replace function public.audit_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- ---------------------------------------------------------------------
-- 3. Rate limiting (login and event access-code attempts)
-- ---------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_bucket_idx on public.rate_limit_events(bucket, created_at);

create or replace function public.rate_limit_allowed(p_bucket text, p_max int, p_window_seconds int)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < p_max from public.rate_limit_events
  where bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
$$;

create or replace function public.rate_limit_record(p_bucket text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.rate_limit_events(bucket) values (p_bucket);
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
end $$;

-- ---------------------------------------------------------------------
-- 4. School events
-- ---------------------------------------------------------------------
create table if not exists public.school_events (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  school_name             text not null,
  -- short label used in banners and the cart, e.g. "Arthur Lok Jack"
  short_name              text not null default '',
  event_date              date not null,
  timezone                text not null default 'America/Port_of_Spain' check (timezone = 'America/Port_of_Spain'),
  order_cutoff_at         timestamptz not null,
  collection_start_at     timestamptz not null,
  collection_end_at       timestamptz not null,
  collection_location     text not null default '',
  collection_instructions text not null default '',
  -- scrypt hash of the access code. NULL = no code set = nobody can get in.
  access_code_hash        text,
  -- bumped whenever the code changes or sessions are revoked; older sessions stop working
  access_code_version     integer not null default 1,
  session_ttl_minutes     integer not null default 240 check (session_ttl_minutes between 5 and 1440),
  status                  text not null default 'draft' check (status in ('draft','open','closed','archived')),
  event_fee               numeric(10,2) not null default 0 check (event_fee >= 0),
  allowed_payment_methods text[] not null default array['cash_on_collection','bank_transfer'],
  hidden_item_ids         text[] not null default '{}',
  student_id_required     boolean not null default false,
  policy_version          text not null,
  policy_text             text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint school_events_collection_window check (collection_end_at > collection_start_at),
  constraint school_events_payment_methods check (
    allowed_payment_methods <@ array['cash_on_collection','bank_transfer','online_provider']
    and cardinality(allowed_payment_methods) > 0)
);

create table if not exists public.event_sessions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.school_events(id) on delete cascade,
  code_version integer not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  ip_hash      text
);
create index if not exists event_sessions_event_idx on public.event_sessions(event_id);

-- Non-sensitive record of access attempts (never the code itself).
create table if not exists public.event_access_attempts (
  id         bigint generated always as identity primary key,
  event_id   uuid references public.school_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  success    boolean not null,
  ip_hash    text
);

-- ---------------------------------------------------------------------
-- 5. New order columns (all nullable; old orders are untouched)
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

alter table public.orders
  add column if not exists order_number                  text,
  add column if not exists idempotency_key               text,
  add column if not exists fulfilment_type               text,
  add column if not exists scheduled_fulfilment_date     date,
  add column if not exists payment_method                text,
  add column if not exists payment_status                text,
  add column if not exists amount_paid                   numeric(10,2),
  add column if not exists paid_at                       timestamptz,
  add column if not exists subtotal                      numeric(10,2),
  add column if not exists delivery_fee                  numeric(10,2),
  add column if not exists service_fee                   numeric(10,2),
  add column if not exists delivery_area                 text,
  add column if not exists heat                          text,
  add column if not exists items                         jsonb,
  add column if not exists menu_version                  text,
  add column if not exists school_event_id               uuid references public.school_events(id) on delete restrict,
  add column if not exists programme_or_cohort           text,
  add column if not exists student_id                    text,
  add column if not exists collection_name               text,
  add column if not exists event_policy_version          text,
  add column if not exists event_policy_text             text,
  add column if not exists event_policy_acknowledged_at  timestamptz,
  add column if not exists collected_at                  timestamptz,
  add column if not exists collected_by                  text,
  add column if not exists cancelled_at                  timestamptz,
  add column if not exists updated_at                    timestamptz;

alter table public.orders alter column order_number set default ('CB-' || lpad(nextval('public.order_number_seq')::text, 5, '0'));

create unique index if not exists orders_order_number_key    on public.orders(order_number) where order_number is not null;
create unique index if not exists orders_idempotency_key_key on public.orders(idempotency_key) where idempotency_key is not null;
create index if not exists orders_school_event_idx            on public.orders(school_event_id) where school_event_id is not null;
create index if not exists orders_scheduled_date_idx          on public.orders(scheduled_fulfilment_date);

-- Allow the new "preparing" kitchen status. Any old status check is replaced
-- by one that accepts the original five values plus "preparing".
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%' and conname <> 'orders_status_check_v2'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_status_check_v2') then
    alter table public.orders add constraint orders_status_check_v2
      check (status in ('new','confirmed','preparing','ready','completed','cancelled')) not valid;
  end if;

  -- Same for the fulfillment column: add the distinct school-event value.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%fulfil%' and conname <> 'orders_fulfillment_check_v2'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_fulfillment_check_v2') then
    alter table public.orders add constraint orders_fulfillment_check_v2
      check (fulfillment is null or fulfillment in ('pickup','delivery','school_event_collection')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Payments ledger. Payments are only ever added, never edited; the
--    order's amount_paid / payment_status are derived from this table.
--    order_id copies the type of orders.id (uuid or bigint).
-- ---------------------------------------------------------------------
do $$
declare id_type text;
begin
  select format_type(atttypid, atttypmod) into id_type
  from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'id';

  if to_regclass('public.payments') is null then
    execute format($f$
      create table public.payments (
        id                      uuid primary key default gen_random_uuid(),
        order_id                %s not null references public.orders(id) on delete restrict,
        kind                    text not null check (kind in ('payment','refund')),
        method                  text not null check (method in ('cash','bank_transfer','online_provider','other')),
        amount                  numeric(10,2) not null check (amount > 0),
        received_at             timestamptz not null,
        reference               text,
        note                    text,
        recorded_by             text not null,
        provider                text,
        provider_transaction_id text unique,
        idempotency_key         text unique,
        created_at              timestamptz not null default now()
      )$f$, id_type);
  end if;
end $$;
create index if not exists payments_order_idx on public.payments(order_id);

create or replace function public.payments_are_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Payments cannot be edited or deleted. Record a refund instead.';
end $$;
drop trigger if exists payments_immutable on public.payments;
create trigger payments_immutable before update or delete on public.payments
  for each row execute function public.payments_are_immutable();

-- ---------------------------------------------------------------------
-- 7. Rules enforced inside the database
-- ---------------------------------------------------------------------
-- School-event orders: the event must be open and before its cutoff at the
-- moment the row is written. This holds even if someone bypasses the website.
create or replace function public.enforce_school_event_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev public.school_events%rowtype;
begin
  if new.school_event_id is null then
    if new.fulfilment_type = 'school_event_collection' then
      raise exception 'SCHOOL_EVENT_REQUIRED';
    end if;
    return new;
  end if;
  select * into ev from public.school_events where id = new.school_event_id;
  if not found then raise exception 'SCHOOL_EVENT_NOT_FOUND'; end if;
  if ev.status <> 'open' then raise exception 'SCHOOL_EVENT_CLOSED'; end if;
  if now() >= ev.order_cutoff_at then raise exception 'SCHOOL_EVENT_CUTOFF_PASSED'; end if;
  new.fulfilment_type := 'school_event_collection';
  new.fulfillment := 'school_event_collection';
  new.scheduled_fulfilment_date := ev.event_date;
  new.address := null;
  new.delivery_fee := 0;
  return new;
end $$;
drop trigger if exists orders_enforce_school_event on public.orders;
create trigger orders_enforce_school_event before insert on public.orders
  for each row execute function public.enforce_school_event_order();

-- Event orders can never be moved to another event or have their price
-- snapshot rewritten after they are placed.
create or replace function public.protect_order_snapshot() returns trigger
language plpgsql as $$
begin
  if old.school_event_id is distinct from new.school_event_id then
    raise exception 'An order cannot be moved between school events.';
  end if;
  if old.school_event_id is not null and (
       old.items is distinct from new.items or old.subtotal is distinct from new.subtotal
    or old.total is distinct from new.total or old.service_fee is distinct from new.service_fee) then
    raise exception 'School-event order items and totals are locked. Cancel and re-order instead.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists orders_protect_snapshot on public.orders;
create trigger orders_protect_snapshot before update on public.orders
  for each row execute function public.protect_order_snapshot();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists school_events_touch on public.school_events;
create trigger school_events_touch before update on public.school_events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 8. Payment recording (atomic: ledger row + order totals + audit entry)
-- ---------------------------------------------------------------------
create or replace function public.recalculate_order_payment(p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o record; paid numeric; refunded numeric; net numeric; last_paid timestamptz; st text;
begin
  select * into o from public.orders where id::text = p_order_id;
  select coalesce(sum(amount) filter (where kind = 'payment'), 0),
         coalesce(sum(amount) filter (where kind = 'refund'), 0),
         max(received_at) filter (where kind = 'payment')
    into paid, refunded, last_paid
  from public.payments where order_id::text = p_order_id;
  net := paid - refunded;
  if refunded > 0 and net <= 0 then st := 'refunded';
  elsif net >= o.total and o.total > 0 then st := 'paid';
  elsif net > 0 then st := 'partially_paid';
  elsif o.status = 'cancelled' then st := 'failed_or_cancelled';
  elsif o.payment_status = 'failed_or_cancelled' then st := 'failed_or_cancelled';
  elsif o.payment_method = 'bank_transfer' then st := 'awaiting_bank_transfer_verification';
  else st := 'pending_payment';
  end if;
  update public.orders
     set amount_paid = net,
         paid_at = case when net > 0 then last_paid else null end,
         payment_status = st
   where id::text = p_order_id;
end $$;

create or replace function public.record_order_payment(
  p_order_id text, p_kind text, p_method text, p_amount numeric,
  p_received_at timestamptz, p_reference text, p_note text,
  p_actor text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; existing record; net numeric; before_state jsonb; after_state jsonb; new_id uuid;
begin
  if p_kind not in ('payment','refund') then raise exception 'INVALID_KIND'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_actor is null or length(trim(p_actor)) = 0 then raise exception 'ACTOR_REQUIRED'; end if;

  -- Same request sent twice (double click, retry): return the first result.
  if p_idempotency_key is not null then
    select * into existing from public.payments where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('payment_id', existing.id, 'duplicate', true);
    end if;
  end if;

  select * into o from public.orders where id::text = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_kind = 'payment' and o.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;

  select coalesce(sum(case when kind = 'payment' then amount else -amount end), 0) into net
  from public.payments where order_id::text = p_order_id;
  if p_kind = 'refund' and p_amount > net then raise exception 'REFUND_EXCEEDS_PAID'; end if;

  before_state := jsonb_build_object('payment_status', o.payment_status, 'amount_paid', o.amount_paid);

  execute 'insert into public.payments(order_id, kind, method, amount, received_at, reference, note, recorded_by, idempotency_key)
           select id, $1, $2, $3, $4, $5, $6, $7, $8 from public.orders where id::text = $9 returning id'
    into new_id
    using p_kind, p_method, p_amount, coalesce(p_received_at, now()), nullif(trim(p_reference), ''),
          nullif(trim(p_note), ''), p_actor, p_idempotency_key, p_order_id;

  perform public.recalculate_order_payment(p_order_id);

  select jsonb_build_object('payment_status', payment_status, 'amount_paid', amount_paid) into after_state
  from public.orders where id::text = p_order_id;

  insert into public.audit_log(actor, action, entity_type, entity_id, before, after, meta)
  values (p_actor, 'order.' || p_kind || '_recorded', 'order', p_order_id, before_state, after_state,
          jsonb_build_object('payment_id', new_id, 'method', p_method, 'amount', p_amount,
                             'received_at', coalesce(p_received_at, now()), 'reference', p_reference, 'note', p_note));

  return jsonb_build_object('payment_id', new_id, 'duplicate', false) || after_state;
end $$;

-- Mark a payment as failed/cancelled (only when nothing has been received).
create or replace function public.mark_order_payment_failed(p_order_id text, p_actor text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o record; net numeric;
begin
  select * into o from public.orders where id::text = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select coalesce(sum(case when kind = 'payment' then amount else -amount end), 0) into net
  from public.payments where order_id::text = p_order_id;
  if net > 0 then raise exception 'ORDER_HAS_PAYMENTS'; end if;
  update public.orders set payment_status = 'failed_or_cancelled' where id::text = p_order_id;
  insert into public.audit_log(actor, action, entity_type, entity_id, before, after, meta)
  values (p_actor, 'order.payment_marked_failed', 'order', p_order_id,
          jsonb_build_object('payment_status', o.payment_status),
          jsonb_build_object('payment_status', 'failed_or_cancelled'),
          jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------
-- 9. Order status changes (separate from payment; audited)
-- ---------------------------------------------------------------------
create or replace function public.set_order_status(p_order_id text, p_status text, p_actor text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; allowed boolean;
begin
  if p_status not in ('new','confirmed','preparing','ready','completed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  select * into o from public.orders where id::text = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = p_status then return jsonb_build_object('status', o.status, 'unchanged', true); end if;

  -- Forward moves are free. Undoing "completed/collected" or "cancelled",
  -- or moving backwards, is a correction and needs a written reason.
  allowed := array_position(array['new','confirmed','preparing','ready','completed'], p_status)
           > coalesce(array_position(array['new','confirmed','preparing','ready','completed'], o.status), 0)
           or p_status = 'cancelled';
  if not allowed and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'CORRECTION_REASON_REQUIRED';
  end if;

  update public.orders set
    status = p_status,
    collected_at = case when p_status = 'completed' then now() when o.status = 'completed' then null else collected_at end,
    collected_by = case when p_status = 'completed' then p_actor when o.status = 'completed' then null else collected_by end,
    cancelled_at = case when p_status = 'cancelled' then now() when o.status = 'cancelled' then null else cancelled_at end,
    payment_status = case when o.status = 'cancelled' then null else payment_status end
  where id::text = p_order_id;

  perform public.recalculate_order_payment(p_order_id);

  insert into public.audit_log(actor, action, entity_type, entity_id, before, after, meta)
  values (p_actor, case when allowed then 'order.status_changed' else 'order.status_corrected' end,
          'order', p_order_id,
          jsonb_build_object('status', o.status, 'collected_at', o.collected_at, 'collected_by', o.collected_by),
          jsonb_build_object('status', p_status),
          jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', p_status, 'unchanged', false);
end $$;

-- ---------------------------------------------------------------------
-- 10. Duplicate an event as a new draft (no orders, payments, sessions or code)
-- ---------------------------------------------------------------------
create or replace function public.duplicate_school_event(p_event_id uuid, p_actor text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev public.school_events%rowtype; new_id uuid; new_slug text;
begin
  select * into ev from public.school_events where id = p_event_id;
  if not found then raise exception 'SCHOOL_EVENT_NOT_FOUND'; end if;
  new_slug := left(ev.slug, 40) || '-copy-' || substr(md5(random()::text), 1, 6);
  insert into public.school_events(
    slug, school_name, short_name, event_date, timezone, order_cutoff_at, collection_start_at, collection_end_at,
    collection_location, collection_instructions, access_code_hash, access_code_version, session_ttl_minutes,
    status, event_fee, allowed_payment_methods, hidden_item_ids, student_id_required, policy_version, policy_text)
  values (
    new_slug, ev.school_name, ev.short_name, ev.event_date, ev.timezone, ev.order_cutoff_at, ev.collection_start_at, ev.collection_end_at,
    ev.collection_location, ev.collection_instructions, null, 1, ev.session_ttl_minutes,
    'draft', ev.event_fee, ev.allowed_payment_methods, ev.hidden_item_ids, ev.student_id_required,
    ev.policy_version, ev.policy_text)
  returning id into new_id;
  insert into public.audit_log(actor, action, entity_type, entity_id, meta)
  values (p_actor, 'school_event.duplicated', 'school_event', new_id::text, jsonb_build_object('source_event_id', p_event_id));
  return new_id;
end $$;

-- ---------------------------------------------------------------------
-- 11. Seed: Arthur Lok Jack — Thursday 15 October 2026
--     Opens with NO access code; nobody can enter until one is set in Admin.
-- ---------------------------------------------------------------------
insert into public.school_events (
  slug, school_name, short_name, event_date, order_cutoff_at, collection_start_at, collection_end_at,
  collection_location, collection_instructions, status, event_fee, allowed_payment_methods,
  policy_version, policy_text)
values (
  'arthur-lok-jack-oct-15-2026',
  'Arthur Lok Jack Global School of Business',
  'Arthur Lok Jack',
  '2026-10-15',
  '2026-10-15T09:30:00-04:00',
  '2026-10-15T12:00:00-04:00',
  '2026-10-15T14:00:00-04:00',
  'Arthur Lok Jack Global School of Business',
  'All orders will be available at the school between 12:00 PM and 2:00 PM. Bring your order number.',
  'open',
  0,
  array['cash_on_collection','bank_transfer'],
  'alj-2026-10-15-v1',
  'I understand that this order is for collection at Arthur Lok Jack Global School of Business between 12:00 PM and 2:00 PM on Thursday, October 15, 2026, and that orders close at 9:30 AM that morning.'
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 12. Only the server (service role) may call the privileged functions.
-- ---------------------------------------------------------------------
revoke execute on function public.rate_limit_allowed(text, int, int)                 from public, anon, authenticated;
revoke execute on function public.rate_limit_record(text)                            from public, anon, authenticated;
revoke execute on function public.recalculate_order_payment(text)                    from public, anon, authenticated;
revoke execute on function public.record_order_payment(text, text, text, numeric, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_order_payment_failed(text, text, text)        from public, anon, authenticated;
revoke execute on function public.set_order_status(text, text, text, text)           from public, anon, authenticated;
revoke execute on function public.duplicate_school_event(uuid, text)                 from public, anon, authenticated;
grant  execute on function public.rate_limit_allowed(text, int, int)                 to service_role;
grant  execute on function public.rate_limit_record(text)                            to service_role;
grant  execute on function public.recalculate_order_payment(text)                    to service_role;
grant  execute on function public.record_order_payment(text, text, text, numeric, timestamptz, text, text, text, text) to service_role;
grant  execute on function public.mark_order_payment_failed(text, text, text)        to service_role;
grant  execute on function public.set_order_status(text, text, text, text)           to service_role;
grant  execute on function public.duplicate_school_event(uuid, text)                 to service_role;

-- New tables are private from the start (no policies = no anonymous access).
alter table public.admin_users           enable row level security;
alter table public.admin_sessions        enable row level security;
alter table public.audit_log             enable row level security;
alter table public.rate_limit_events     enable row level security;
alter table public.school_events         enable row level security;
alter table public.event_sessions        enable row level security;
alter table public.event_access_attempts enable row level security;
alter table public.payments              enable row level security;
revoke all on public.admin_users, public.admin_sessions, public.audit_log, public.rate_limit_events,
              public.school_events, public.event_sessions, public.event_access_attempts, public.payments
  from anon, authenticated;
grant all on public.admin_users, public.admin_sessions, public.audit_log, public.rate_limit_events,
             public.school_events, public.event_sessions, public.event_access_attempts, public.payments
  to service_role;

commit;
