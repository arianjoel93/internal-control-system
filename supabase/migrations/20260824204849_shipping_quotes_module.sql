alter table public.admin_module_permissions
  add column if not exists can_access_shipping_quotes boolean not null default false;

alter table public.admin_module_permission_items
  drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
  add constraint admin_module_permission_items_module_key_check
  check (module_key in (
    'supports',
    'inventory',
    'policies',
    'reports',
    'purchases',
    'marketing',
    'forms',
    'calculator',
    'meeting_room',
    'quoting',
    'shipping_quotes'
  ));

update public.admin_module_permissions
set can_access_shipping_quotes = true
where role = 'owner'
   or user_type = 'owner'
   or lower(email) = 'joeltrincadov@gmail.com';

create or replace function private.enforce_owner_permission_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'joeltrincadov@gmail.com' then
    if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = 'joeltrincadov@gmail.com'
       and lower(coalesce(new.email, '')) <> lower(coalesce(old.email, '')) then
      raise exception 'El correo del Propietario principal no puede cambiarse.';
    end if;
    new.role := 'owner';
    new.user_type := 'owner';
    new.is_active := true;
  end if;

  if new.role = 'owner' then
    new.user_type := 'owner';
    new.can_access_supports := true;
    new.can_access_inventory := true;
    new.can_access_policies := true;
    new.can_access_reports := true;
    new.can_access_purchases := true;
    new.can_access_marketing := true;
    new.can_access_forms := true;
    new.can_access_quoting := true;
    new.can_access_shipping_quotes := true;
    new.can_access_calculator := true;
  end if;

  return new;
end;
$$;

insert into public.admin_module_permission_items (
  permission_id,
  user_id,
  module_key,
  can_access,
  visibility_scope,
  actions
)
select
  permissions.id,
  permissions.user_id,
  'shipping_quotes',
  permissions.can_access_shipping_quotes,
  'all',
  jsonb_build_object(
    'view', permissions.can_access_shipping_quotes,
    'create', permissions.can_access_shipping_quotes,
    'edit', false,
    'delete', false,
    'export', false,
    'view_all', permissions.role in ('owner', 'manager') or permissions.user_type = 'owner'
  )
from public.admin_module_permissions permissions
on conflict (user_id, module_key) do nothing;

create table if not exists public.shipping_carrier_settings (
  id uuid primary key default gen_random_uuid(),
  carrier text not null default 'FEDEX',
  environment text not null default 'SANDBOX',
  is_active boolean not null default false,
  fedex_base_url text not null default 'https://apis-sandbox.fedex.com',
  account_number_masked text,
  client_id_masked text,
  child_key_masked text,
  account_number_encrypted text,
  client_id_encrypted text,
  client_secret_encrypted text,
  child_key_encrypted text,
  child_secret_encrypted text,
  origin_country_code text not null default 'MX',
  origin_postal_code text,
  origin_state_code text,
  origin_city text,
  origin_street text,
  preferred_currency text not null default 'MXN',
  pickup_type text not null default 'USE_SCHEDULED_PICKUP',
  return_transit_times boolean not null default true,
  rate_request_types jsonb not null default '["ACCOUNT"]'::jsonb,
  rate_display_option text not null default 'LOWER_RATE',
  weight_input_mode text not null default 'NET_CONTENT',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier),
  constraint shipping_carrier_settings_carrier_check check (carrier in ('FEDEX')),
  constraint shipping_carrier_settings_environment_check check (environment in ('SANDBOX', 'PRODUCTION')),
  constraint shipping_carrier_settings_weight_input_mode_check check (weight_input_mode in ('NET_CONTENT', 'GROSS_PACKAGE')),
  constraint shipping_carrier_settings_currency_check check (preferred_currency ~ '^[A-Z]{3}$'),
  constraint shipping_carrier_settings_country_check check (origin_country_code ~ '^[A-Z]{2}$')
);

create table if not exists public.shipping_package_types (
  id uuid primary key default gen_random_uuid(),
  carrier text not null default 'FEDEX',
  name text not null,
  internal_code text not null unique,
  description text,
  length numeric(12, 2),
  width numeric(12, 2),
  height numeric(12, 2),
  dimension_unit text not null default 'CM',
  empty_weight numeric(12, 3),
  weight_unit text not null default 'KG',
  max_weight numeric(12, 3),
  is_active boolean not null default false,
  sort_order integer not null default 100,
  fedex_packaging_type text not null default 'YOUR_PACKAGING',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_package_types_units_check check (dimension_unit in ('CM', 'IN') and weight_unit in ('KG', 'LB')),
  constraint shipping_package_types_values_check check (
    (length is null or length > 0)
    and (width is null or width > 0)
    and (height is null or height > 0)
    and (empty_weight is null or empty_weight >= 0)
    and (max_weight is null or max_weight > 0)
  ),
  constraint shipping_package_types_active_requires_values_check check (
    not is_active
    or (
      length > 0
      and width > 0
      and height > 0
      and empty_weight >= 0
      and max_weight > 0
    )
  )
);

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  carrier text not null default 'FEDEX',
  environment text not null,
  status text not null default 'SUCCESS',
  calculation_method text not null default 'MULTI_PACKAGE_RATE',
  origin jsonb not null,
  destination jsonb not null,
  requested_ship_date date,
  package_count integer not null default 0,
  total_content_weight numeric(14, 3) not null default 0,
  total_billable_weight numeric(14, 3) not null default 0,
  weight_unit text not null default 'KG',
  best_rate_id uuid,
  best_total_amount numeric(14, 2),
  best_currency text,
  best_service_code text,
  best_service_name text,
  best_delivery_label text,
  error_message text,
  technical_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_quotes_status_check check (status in ('SUCCESS', 'ERROR')),
  constraint shipping_quotes_method_check check (calculation_method in ('MULTI_PACKAGE_RATE', 'INDIVIDUAL_PACKAGE_SUM')),
  constraint shipping_quotes_weight_unit_check check (weight_unit in ('KG', 'LB'))
);

create table if not exists public.shipping_quote_packages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.shipping_quotes(id) on delete cascade,
  package_type_id uuid references public.shipping_package_types(id) on delete set null,
  package_snapshot jsonb not null,
  package_index integer not null,
  content_weight numeric(14, 3) not null,
  tare_weight numeric(14, 3) not null,
  billable_weight numeric(14, 3) not null,
  weight_unit text not null,
  length numeric(12, 2) not null,
  width numeric(12, 2) not null,
  height numeric(12, 2) not null,
  dimension_unit text not null,
  created_at timestamptz not null default now(),
  constraint shipping_quote_packages_values_check check (
    package_index > 0
    and content_weight > 0
    and tare_weight >= 0
    and billable_weight > 0
    and length > 0
    and width > 0
    and height > 0
    and weight_unit in ('KG', 'LB')
    and dimension_unit in ('CM', 'IN')
  )
);

create table if not exists public.shipping_quote_rates (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.shipping_quotes(id) on delete cascade,
  carrier text not null default 'FEDEX',
  service_code text not null,
  service_name text not null,
  currency text not null,
  base_amount numeric(14, 2),
  discount_amount numeric(14, 2),
  surcharge_amount numeric(14, 2),
  tax_amount numeric(14, 2),
  total_amount numeric(14, 2) not null,
  transit_days integer,
  estimated_delivery_date date,
  delivery_timestamp timestamptz,
  delivery_label text,
  rate_type text,
  raw_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint shipping_quote_rates_amount_check check (
    total_amount >= 0
    and (base_amount is null or base_amount >= 0)
    and (discount_amount is null or discount_amount >= 0)
    and (surcharge_amount is null or surcharge_amount >= 0)
    and (tax_amount is null or tax_amount >= 0)
    and (transit_days is null or transit_days >= 0)
  )
);

create table if not exists public.shipping_settings_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  field_name text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create sequence if not exists public.shipping_quotes_number_seq;

create or replace function public.next_shipping_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'ENV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.shipping_quotes_number_seq')::text, 6, '0');
end;
$$;

drop trigger if exists shipping_carrier_settings_set_updated_at on public.shipping_carrier_settings;
create trigger shipping_carrier_settings_set_updated_at
before update on public.shipping_carrier_settings
for each row
execute function public.set_updated_at();

drop trigger if exists shipping_package_types_set_updated_at on public.shipping_package_types;
create trigger shipping_package_types_set_updated_at
before update on public.shipping_package_types
for each row
execute function public.set_updated_at();

drop trigger if exists shipping_quotes_set_updated_at on public.shipping_quotes;
create trigger shipping_quotes_set_updated_at
before update on public.shipping_quotes
for each row
execute function public.set_updated_at();

alter table public.shipping_carrier_settings enable row level security;
alter table public.shipping_package_types enable row level security;
alter table public.shipping_quotes enable row level security;
alter table public.shipping_quote_packages enable row level security;
alter table public.shipping_quote_rates enable row level security;
alter table public.shipping_settings_audit enable row level security;

drop policy if exists "shipping admins manage carrier settings" on public.shipping_carrier_settings;
create policy "shipping admins manage carrier settings"
on public.shipping_carrier_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
      and exists (
        select 1
        from public.admin_module_permission_items items
        where items.user_id = permissions.user_id
          and items.module_key = 'shipping_quotes'
          and items.can_access
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
      and exists (
        select 1
        from public.admin_module_permission_items items
        where items.user_id = permissions.user_id
          and items.module_key = 'shipping_quotes'
          and items.can_access
      )
  )
);

drop policy if exists "shipping users read active package types" on public.shipping_package_types;
create policy "shipping users read active package types"
on public.shipping_package_types
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.admin_module_permission_items items
    join public.admin_module_permissions permissions on permissions.user_id = items.user_id
    where items.user_id = (select auth.uid())
      and items.module_key = 'shipping_quotes'
      and items.can_access
      and permissions.is_active
  )
);

drop policy if exists "shipping admins manage package types" on public.shipping_package_types;
create policy "shipping admins manage package types"
on public.shipping_package_types
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
      and exists (
        select 1
        from public.admin_module_permission_items items
        where items.user_id = permissions.user_id
          and items.module_key = 'shipping_quotes'
          and items.can_access
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
      and exists (
        select 1
        from public.admin_module_permission_items items
        where items.user_id = permissions.user_id
          and items.module_key = 'shipping_quotes'
          and items.can_access
      )
  )
);

drop policy if exists "shipping users read own quotes" on public.shipping_quotes;
create policy "shipping users read own quotes"
on public.shipping_quotes
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
  )
);

drop policy if exists "shipping users insert own quotes" on public.shipping_quotes;
create policy "shipping users insert own quotes"
on public.shipping_quotes
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "shipping users read own quote packages" on public.shipping_quote_packages;
create policy "shipping users read own quote packages"
on public.shipping_quote_packages
for select
to authenticated
using (
  exists (
    select 1
    from public.shipping_quotes quotes
    where quotes.id = quote_id
      and (
        quotes.user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and permissions.role in ('owner', 'manager')
        )
      )
  )
);

drop policy if exists "shipping users read own quote rates" on public.shipping_quote_rates;
create policy "shipping users read own quote rates"
on public.shipping_quote_rates
for select
to authenticated
using (
  exists (
    select 1
    from public.shipping_quotes quotes
    where quotes.id = quote_id
      and (
        quotes.user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and permissions.role in ('owner', 'manager')
        )
      )
  )
);

drop policy if exists "shipping admins read settings audit" on public.shipping_settings_audit;
create policy "shipping admins read settings audit"
on public.shipping_settings_audit
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and permissions.role in ('owner', 'manager')
  )
);

insert into public.shipping_carrier_settings (
  carrier,
  environment,
  is_active,
  fedex_base_url,
  origin_country_code,
  preferred_currency,
  pickup_type,
  return_transit_times,
  rate_request_types,
  rate_display_option,
  weight_input_mode
)
values (
  'FEDEX',
  'SANDBOX',
  false,
  'https://apis-sandbox.fedex.com',
  'MX',
  'MXN',
  'USE_SCHEDULED_PICKUP',
  true,
  '["ACCOUNT"]'::jsonb,
  'LOWER_RATE',
  'NET_CONTENT'
)
on conflict (carrier) do nothing;

insert into public.shipping_package_types (
  name,
  internal_code,
  description,
  fedex_packaging_type,
  is_active,
  sort_order
)
values
  ('Embalaje pequeño', 'SMALL', 'Pendiente de configuración por el administrador.', 'YOUR_PACKAGING', false, 10),
  ('Embalaje mediano', 'MEDIUM', 'Pendiente de configuración por el administrador.', 'YOUR_PACKAGING', false, 20),
  ('Embalaje grande', 'LARGE', 'Pendiente de configuración por el administrador.', 'YOUR_PACKAGING', false, 30),
  ('Embalaje Jumbo', 'JUMBO', 'Pendiente de configuración por el administrador.', 'YOUR_PACKAGING', false, 40)
on conflict (internal_code) do nothing;

create index if not exists shipping_package_types_active_order_idx
  on public.shipping_package_types (is_active, sort_order, name);
create index if not exists shipping_quotes_user_created_idx
  on public.shipping_quotes (user_id, created_at desc);
create index if not exists shipping_quotes_quote_number_idx
  on public.shipping_quotes (quote_number);
create index if not exists shipping_quotes_status_idx
  on public.shipping_quotes (status);
create index if not exists shipping_quotes_carrier_idx
  on public.shipping_quotes (carrier);
create index if not exists shipping_quotes_destination_postal_idx
  on public.shipping_quotes ((destination->>'postalCode'));
create index if not exists shipping_quote_packages_quote_idx
  on public.shipping_quote_packages (quote_id);
create index if not exists shipping_quote_rates_quote_amount_idx
  on public.shipping_quote_rates (quote_id, total_amount);

grant select, insert, update on public.shipping_carrier_settings to authenticated;
grant select, insert, update on public.shipping_package_types to authenticated;
grant select, insert on public.shipping_quotes to authenticated;
grant select on public.shipping_quote_packages to authenticated;
grant select on public.shipping_quote_rates to authenticated;
grant select on public.shipping_settings_audit to authenticated;
grant execute on function public.next_shipping_quote_number() to service_role;
revoke execute on function public.next_shipping_quote_number() from public, anon, authenticated;

notify pgrst, 'reload schema';
