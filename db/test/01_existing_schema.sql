-- TEST ONLY. Approximates the tables that already exist in the live
-- database (created by hand in the Supabase dashboard), reconstructed from
-- how the current code reads and writes them. Used to prove the migrations
-- apply cleanly on top of the existing schema. Never run against production.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text,
  package text,
  details text[],
  fulfillment text check (fulfillment in ('delivery','pickup')),
  address text,
  notes text,
  total integer not null default 0,
  status text not null default 'new',
  constraint orders_status_check check (status in ('new','confirmed','ready','completed','cancelled'))
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  category text not null,
  description text,
  amount numeric not null,
  date date not null default current_date,
  payment_method text,
  receipt_number text,
  supplier text,
  notes text
);

create table if not exists public.settings (
  key text primary key,
  value text
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  rating integer not null,
  comment text not null,
  approved boolean not null default false
);

-- Wide-open policies, like a project where RLS was enabled with
-- "allow all" policies (or not enabled at all).
alter table public.orders enable row level security;
create policy "public all orders" on public.orders for all using (true) with check (true);
alter table public.accounts enable row level security;
create policy "public all accounts" on public.accounts for all using (true) with check (true);

insert into public.settings(key, value) values ('orders_open','true'), ('menu_ramen','true'), ('menu_lobster_half','false')
on conflict do nothing;
insert into public.orders(name, phone, package, details, fulfillment, notes, total, status)
values ('Legacy Customer', '868-555-0000', '1x Club Solo', array['1x Club Solo (Shrimp) - TT$130'], 'pickup', 'Payment: cash_on_delivery
Day: Thursday', 130, 'completed');
insert into public.accounts(type, category, description, amount, date) values ('expense','Ingredients','POS purchase',121.80,'2026-10-01');
insert into public.reviews(name, rating, comment, approved) values ('A', 5, 'Great', true), ('B', 1, 'pending one', false);
