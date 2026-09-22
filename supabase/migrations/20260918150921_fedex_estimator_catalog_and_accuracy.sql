begin;

create table if not exists public.fedex_estimator_weight_bands (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  min_kg numeric(12, 3) not null,
  max_kg numeric(12, 3),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fedex_estimator_weight_band_values_check check (min_kg >= 0 and (max_kg is null or max_kg > min_kg))
);

create table if not exists public.fedex_estimator_rate_cards (
  id uuid primary key default gen_random_uuid(),
  service_code text not null,
  service_name text not null,
  fedex_zone text not null,
  weight_from_kg numeric(12, 3) not null,
  weight_to_kg numeric(12, 3),
  rate numeric(14, 4) not null,
  currency text not null default 'MXN',
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  source_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fedex_estimator_rate_card_values_check check (weight_from_kg >= 0 and (weight_to_kg is null or weight_to_kg > weight_from_kg) and rate >= 0)
);

alter table public.shipping_rate_estimates
  add column if not exists estimation_method text not null default 'NONE',
  add column if not exists period_days integer,
  add column if not exists weight_band_from_kg numeric(12, 3),
  add column if not exists weight_band_to_kg numeric(12, 3),
  add column if not exists api_amount numeric(14, 4),
  add column if not exists api_currency text,
  add column if not exists api_transaction_id text,
  add column if not exists api_error_status integer,
  add column if not exists api_error_code text,
  add column if not exists api_error_message text,
  add column if not exists absolute_error numeric(14, 4),
  add column if not exists percentage_error numeric(14, 6);

alter table public.shipping_rate_estimates drop constraint if exists shipping_rate_estimates_method_check;
alter table public.shipping_rate_estimates add constraint shipping_rate_estimates_method_check check (estimation_method in ('FEDEX_API', 'HISTORICAL_MEDIAN', 'TARIFF', 'NONE'));

create or replace function public.fedex_estimator_catalog_set_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end; $$;

drop trigger if exists fedex_estimator_weight_bands_set_updated_at on public.fedex_estimator_weight_bands;
create trigger fedex_estimator_weight_bands_set_updated_at before update on public.fedex_estimator_weight_bands for each row execute function public.fedex_estimator_catalog_set_updated_at();
drop trigger if exists fedex_estimator_rate_cards_set_updated_at on public.fedex_estimator_rate_cards;
create trigger fedex_estimator_rate_cards_set_updated_at before update on public.fedex_estimator_rate_cards for each row execute function public.fedex_estimator_catalog_set_updated_at();

insert into public.fedex_estimator_weight_bands (label, min_kg, max_kg, sort_order)
select source.label, source.min_kg, source.max_kg, source.sort_order
from (values
  ('0–1 kg', 0::numeric, 1::numeric, 10), ('> 1–2 kg', 1::numeric, 2::numeric, 20),
  ('> 2–5 kg', 2::numeric, 5::numeric, 30), ('> 5–10 kg', 5::numeric, 10::numeric, 40),
  ('> 10–15 kg', 10::numeric, 15::numeric, 50), ('> 15–20 kg', 15::numeric, 20::numeric, 60),
  ('> 20–30 kg', 20::numeric, 30::numeric, 70), ('> 30–40 kg', 30::numeric, 40::numeric, 80),
  ('> 40–50 kg', 40::numeric, 50::numeric, 90), ('> 50 kg', 50::numeric, null::numeric, 100)
) as source(label, min_kg, max_kg, sort_order)
where not exists (select 1 from public.fedex_estimator_weight_bands existing where existing.min_kg = source.min_kg and existing.max_kg is not distinct from source.max_kg);

alter table public.fedex_estimator_weight_bands enable row level security;
alter table public.fedex_estimator_rate_cards enable row level security;

drop policy if exists "shipping users read estimator weight bands" on public.fedex_estimator_weight_bands;
create policy "shipping users read estimator weight bands" on public.fedex_estimator_weight_bands for select to authenticated using (is_active and exists (select 1 from public.admin_module_permission_items items join public.admin_module_permissions permissions on permissions.id = items.permission_id where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and items.module_key = 'shipping_quotes' and items.can_access is true));
drop policy if exists "shipping admins manage estimator weight bands" on public.fedex_estimator_weight_bands;
create policy "shipping admins manage estimator weight bands" on public.fedex_estimator_weight_bands for all to authenticated using (exists (select 1 from public.admin_module_permissions permissions where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')))) with check (exists (select 1 from public.admin_module_permissions permissions where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager'))));
drop policy if exists "shipping users read estimator rate cards" on public.fedex_estimator_rate_cards;
create policy "shipping users read estimator rate cards" on public.fedex_estimator_rate_cards for select to authenticated using (is_active and exists (select 1 from public.admin_module_permission_items items join public.admin_module_permissions permissions on permissions.id = items.permission_id where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and items.module_key = 'shipping_quotes' and items.can_access is true));
drop policy if exists "shipping admins manage estimator rate cards" on public.fedex_estimator_rate_cards;
create policy "shipping admins manage estimator rate cards" on public.fedex_estimator_rate_cards for all to authenticated using (exists (select 1 from public.admin_module_permissions permissions where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')))) with check (exists (select 1 from public.admin_module_permissions permissions where permissions.user_id = (select auth.uid()) and permissions.is_active is not false and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager'))));

grant select on public.fedex_estimator_weight_bands, public.fedex_estimator_rate_cards to authenticated;
grant all on public.fedex_estimator_weight_bands, public.fedex_estimator_rate_cards to service_role;
create index if not exists fedex_estimator_weight_bands_active_idx on public.fedex_estimator_weight_bands (is_active, sort_order, min_kg);
create index if not exists fedex_estimator_rate_cards_lookup_idx on public.fedex_estimator_rate_cards (is_active, fedex_zone, service_code, weight_from_kg, weight_to_kg);
create index if not exists shipping_rate_estimates_method_idx on public.shipping_rate_estimates (estimation_method, created_at desc);
notify pgrst, 'reload schema';
commit;
