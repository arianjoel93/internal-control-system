alter table public.support_events
add column if not exists event_note text;

create table if not exists public.support_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  full_name_normalized text generated always as (lower(btrim(full_name))) stored,
  email text,
  phone text,
  last_used_at timestamptz not null default now(),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_customers_full_name_normalized_key unique (full_name_normalized)
);

create index if not exists support_customers_name_trgm_idx
on public.support_customers using gin (full_name gin_trgm_ops);

create index if not exists support_customers_last_used_idx
on public.support_customers (last_used_at desc);

drop trigger if exists support_customers_set_updated_at
on public.support_customers;

create trigger support_customers_set_updated_at
before update on public.support_customers
for each row
execute function public.set_updated_at();

insert into public.support_customers (
  full_name,
  email,
  phone,
  last_used_at,
  created_by,
  created_by_email
)
select distinct on (lower(btrim(customer_name)))
  btrim(customer_name) as full_name,
  customer_email,
  customer_phone,
  coalesce(updated_at, created_at, now()) as last_used_at,
  created_by,
  created_by_email
from public.support_cases
where btrim(coalesce(customer_name, '')) <> ''
order by lower(btrim(customer_name)), coalesce(updated_at, created_at, now()) desc
on conflict (full_name_normalized) do update
set
  email = coalesce(excluded.email, public.support_customers.email),
  phone = coalesce(excluded.phone, public.support_customers.phone),
  last_used_at = greatest(public.support_customers.last_used_at, excluded.last_used_at);

alter table public.support_customers enable row level security;

grant select, insert, update
on public.support_customers
to authenticated;

create policy "authenticated can read support customers"
on public.support_customers
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can insert support customers"
on public.support_customers
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support customers"
on public.support_customers
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
