-- =====================================================================
-- The Club Boils — Migration 002
-- Lock down the public (anon) key with Row Level Security
--
-- RUN THIS ONLY AFTER the new code is deployed and you can sign in to
-- /admin with your new Supabase Auth admin account. The old site code
-- reads orders/accounts directly from the browser, so running this first
-- would make the old admin pages show nothing.
--
-- After this, the public key in the browser can ONLY:
--   * read the settings table (menu on/off switches, open days)
--   * read approved reviews
--   * submit a new review (always unapproved)
-- Everything else goes through the server, which uses the service-role key.
-- =====================================================================
begin;

-- 1. Remove every existing policy on the business tables (including any
--    "allow all" policies created in the dashboard).
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('orders','accounts','settings','reviews','payments','school_events',
                        'event_sessions','event_access_attempts','admin_users','admin_sessions',
                        'audit_log','rate_limit_events')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2. Turn RLS on everywhere (no policy = no access for anon/authenticated).
alter table public.orders                enable row level security;
alter table public.accounts              enable row level security;
alter table public.settings              enable row level security;
alter table public.reviews               enable row level security;
alter table public.payments              enable row level security;
alter table public.school_events         enable row level security;
alter table public.event_sessions        enable row level security;
alter table public.event_access_attempts enable row level security;
alter table public.admin_users           enable row level security;
alter table public.admin_sessions        enable row level security;
alter table public.audit_log             enable row level security;
alter table public.rate_limit_events     enable row level security;

-- 3. Belt and braces: remove table privileges from the public roles too.
revoke all on public.orders, public.accounts, public.payments, public.school_events,
              public.event_sessions, public.event_access_attempts, public.admin_users,
              public.admin_sessions, public.audit_log, public.rate_limit_events
  from anon, authenticated;
revoke all on public.settings, public.reviews from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

-- 4. The only things the public site may do with the browser key.
grant select on public.settings to anon, authenticated;
create policy "public can read settings" on public.settings
  for select to anon, authenticated using (true);

grant select, insert on public.reviews to anon, authenticated;
do $$
declare s text := pg_get_serial_sequence('public.reviews', 'id');
begin
  if s is not null then execute format('grant usage on sequence %s to anon, authenticated', s); end if;
end $$;
create policy "public can read approved reviews" on public.reviews
  for select to anon, authenticated using (approved = true);
create policy "public can submit unapproved reviews" on public.reviews
  for insert to anon, authenticated
  with check (
    approved = false
    and rating between 1 and 5
    and char_length(name) between 1 and 80
    and char_length(comment) between 1 and 1000
  );

-- 5. The server (service role) keeps full access.
grant all on public.orders, public.accounts, public.settings, public.reviews, public.payments,
             public.school_events, public.event_sessions, public.event_access_attempts,
             public.admin_users, public.admin_sessions, public.audit_log, public.rate_limit_events
  to service_role;
grant usage, select on sequence public.order_number_seq to service_role;

commit;

-- Check the result (should list every table above with rowsecurity = true,
-- and only the three public policies):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
--   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';
