begin;

-- Zone catalogs are intentionally empty. They must be loaded from the carrier's
-- official/current source; invented postal ranges would make an estimate unsafe.
create table if not exists public.fedex_postal_ranges (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'MX',
  postal_code_from text not null,
  postal_code_to text not null,
  postal_group text not null,
  state_name text,
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fedex_postal_ranges_country_check check (country_code ~ '^[A-Z]{2}$'),
  constraint fedex_postal_ranges_postal_check check (
    postal_code_from ~ '^[0-9]{5}$' and postal_code_to ~ '^[0-9]{5}$'
    and postal_code_from <= postal_code_to
  )
);

create table if not exists public.fedex_zone_matrix (
  id uuid primary key default gen_random_uuid(),
  origin_group text not null,
  destination_group text not null,
  zone text not null,
  effective_from date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_group, destination_group, effective_from)
);

create table if not exists public.shipping_rate_estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_postal_code text not null,
  origin_group text,
  destination_postal_code text not null,
  destination_group text,
  fedex_zone text,
  package_count integer not null,
  physical_weight numeric(14,4) not null,
  volumetric_weight numeric(14,4) not null,
  billable_weight numeric(14,4) not null,
  estimated_amount numeric(14,4),
  currency text,
  estimated_low numeric(14,4),
  estimated_high numeric(14,4),
  median_amount numeric(14,4),
  average_amount numeric(14,4),
  minimum_amount numeric(14,4),
  maximum_amount numeric(14,4),
  p25_amount numeric(14,4),
  p75_amount numeric(14,4),
  confidence text not null,
  confidence_score numeric(6,2),
  comparable_count integer not null default 0,
  comparable_quote_ids uuid[] not null default '{}',
  environment_source text not null,
  algorithm_version text not null default 'HISTORICAL_ZONE_V1',
  odoo_order_id integer,
  odoo_order_name text,
  service_code text,
  service_name text,
  outlier_quote_ids uuid[] not null default '{}',
  warning text,
  constraint shipping_rate_estimates_packages_check check (package_count > 0),
  constraint shipping_rate_estimates_weights_check check (
    physical_weight >= 0 and volumetric_weight >= 0 and billable_weight >= 0
  ),
  constraint shipping_rate_estimates_confidence_check check (
    confidence in ('MUY_ALTA', 'ALTA', 'MEDIA', 'BAJA', 'INSUFICIENTE')
  ),
  constraint shipping_rate_estimates_environment_check check (
    environment_source in ('PRODUCTION', 'SANDBOX', 'MIXED', 'NONE')
  )
);

create or replace function public.shipping_rate_estimates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shipping_rate_estimates_set_updated_at on public.shipping_rate_estimates;
create trigger shipping_rate_estimates_set_updated_at
before update on public.shipping_rate_estimates
for each row execute function public.shipping_rate_estimates_set_updated_at();

alter table public.fedex_postal_ranges enable row level security;
alter table public.fedex_zone_matrix enable row level security;
alter table public.shipping_rate_estimates enable row level security;

drop policy if exists "shipping users read fedex postal ranges" on public.fedex_postal_ranges;
create policy "shipping users read fedex postal ranges"
on public.fedex_postal_ranges for select to authenticated
using (
  is_active and exists (
    select 1 from public.admin_module_permission_items items
    join public.admin_module_permissions permissions on permissions.id = items.permission_id
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and items.module_key = 'shipping_quotes'
      and items.can_access is true
  )
);

drop policy if exists "shipping admins manage fedex postal ranges" on public.fedex_postal_ranges;
create policy "shipping admins manage fedex postal ranges"
on public.fedex_postal_ranges for all to authenticated
using (
  exists (
    select 1 from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com')
  )
)
with check (
  exists (
    select 1 from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com')
  )
);

drop policy if exists "shipping users read fedex zone matrix" on public.fedex_zone_matrix;
create policy "shipping users read fedex zone matrix"
on public.fedex_zone_matrix for select to authenticated
using (
  is_active and exists (
    select 1 from public.admin_module_permission_items items
    join public.admin_module_permissions permissions on permissions.id = items.permission_id
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and items.module_key = 'shipping_quotes'
      and items.can_access is true
  )
);

drop policy if exists "shipping admins manage fedex zone matrix" on public.fedex_zone_matrix;
create policy "shipping admins manage fedex zone matrix"
on public.fedex_zone_matrix for all to authenticated
using (
  exists (
    select 1 from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com')
  )
)
with check (
  exists (
    select 1 from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (permissions.user_type = 'owner' or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com')
  )
);

drop policy if exists "shipping users read own rate estimates" on public.shipping_rate_estimates;
create policy "shipping users read own rate estimates"
on public.shipping_rate_estimates for select to authenticated
using (
  user_id = (select auth.uid()) or exists (
    select 1 from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and permissions.role in ('owner', 'manager')
  )
);

grant select on public.fedex_postal_ranges, public.fedex_zone_matrix to authenticated;
grant select on public.shipping_rate_estimates to authenticated;
grant all on public.fedex_postal_ranges, public.fedex_zone_matrix, public.shipping_rate_estimates to service_role;

create index if not exists fedex_postal_ranges_lookup_idx
  on public.fedex_postal_ranges (country_code, is_active, postal_code_from, postal_code_to);
create index if not exists fedex_zone_matrix_lookup_idx
  on public.fedex_zone_matrix (origin_group, destination_group, is_active);
create index if not exists shipping_rate_estimates_user_created_idx
  on public.shipping_rate_estimates (user_id, created_at desc);

notify pgrst, 'reload schema';
commit;
