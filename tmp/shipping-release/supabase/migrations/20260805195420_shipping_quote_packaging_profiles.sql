create table if not exists public.shipping_product_profiles (
  id uuid primary key default gen_random_uuid(),
  odoo_product_id bigint not null unique,
  sku text not null,
  product_name text not null,
  unit_weight_kg numeric(12, 3) not null,
  length_cm numeric(12, 2) not null,
  width_cm numeric(12, 2) not null,
  height_cm numeric(12, 2) not null,
  shipping_mode text not null default 'LOOSE_ITEM',
  packed_weight_kg numeric(12, 3),
  packed_length_cm numeric(12, 2),
  packed_width_cm numeric(12, 2),
  packed_height_cm numeric(12, 2),
  units_per_master_carton integer,
  can_rotate boolean not null default true,
  stackable boolean not null default true,
  fragile boolean not null default false,
  can_combine boolean not null default true,
  product_family text,
  packaging_group text,
  max_units_per_package integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_product_profiles_mode_check
    check (shipping_mode in ('FACTORY_PACKAGE', 'LOOSE_ITEM', 'MASTER_CARTON', 'SHIP_SEPARATELY')),
  constraint shipping_product_profiles_positive_required_check
    check (
      unit_weight_kg > 0
      and length_cm > 0
      and width_cm > 0
      and height_cm > 0
    ),
  constraint shipping_product_profiles_positive_optional_check
    check (
      (packed_weight_kg is null or packed_weight_kg > 0)
      and (packed_length_cm is null or packed_length_cm > 0)
      and (packed_width_cm is null or packed_width_cm > 0)
      and (packed_height_cm is null or packed_height_cm > 0)
      and (units_per_master_carton is null or units_per_master_carton > 0)
      and (max_units_per_package is null or max_units_per_package > 0)
    )
);

create table if not exists public.shipping_boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  inner_length_cm numeric(12, 2) not null,
  inner_width_cm numeric(12, 2) not null,
  inner_height_cm numeric(12, 2) not null,
  outer_length_cm numeric(12, 2) not null,
  outer_width_cm numeric(12, 2) not null,
  outer_height_cm numeric(12, 2) not null,
  empty_weight_kg numeric(12, 3) not null default 0,
  padding_weight_kg numeric(12, 3) not null default 0,
  max_weight_kg numeric(12, 3) not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_boxes_positive_check
    check (
      inner_length_cm > 0
      and inner_width_cm > 0
      and inner_height_cm > 0
      and outer_length_cm > 0
      and outer_width_cm > 0
      and outer_height_cm > 0
      and empty_weight_kg >= 0
      and padding_weight_kg >= 0
      and max_weight_kg > 0
    ),
  constraint shipping_boxes_outer_gte_inner_check
    check (
      outer_length_cm >= inner_length_cm
      and outer_width_cm >= inner_width_cm
      and outer_height_cm >= inner_height_cm
    )
);

create index if not exists shipping_product_profiles_sku_idx
  on public.shipping_product_profiles using btree (lower(sku));

create index if not exists shipping_product_profiles_name_idx
  on public.shipping_product_profiles using btree (lower(product_name));

create index if not exists shipping_boxes_enabled_volume_idx
  on public.shipping_boxes (enabled, outer_length_cm, outer_width_cm, outer_height_cm);

drop trigger if exists shipping_product_profiles_set_updated_at on public.shipping_product_profiles;
create trigger shipping_product_profiles_set_updated_at
before update on public.shipping_product_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists shipping_boxes_set_updated_at on public.shipping_boxes;
create trigger shipping_boxes_set_updated_at
before update on public.shipping_boxes
for each row
execute function public.set_updated_at();

alter table public.shipping_product_profiles enable row level security;
alter table public.shipping_boxes enable row level security;

drop policy if exists "owners can manage shipping product profiles" on public.shipping_product_profiles;
create policy "owners can manage shipping product profiles"
on public.shipping_product_profiles
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin')
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin')
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

drop policy if exists "owners can manage shipping boxes" on public.shipping_boxes;
create policy "owners can manage shipping boxes"
on public.shipping_boxes
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin')
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin')
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

insert into public.shipping_boxes (
  name,
  inner_length_cm,
  inner_width_cm,
  inner_height_cm,
  outer_length_cm,
  outer_width_cm,
  outer_height_cm,
  empty_weight_kg,
  padding_weight_kg,
  max_weight_kg
)
values
  ('Caja chica', 24, 18, 12, 26, 20, 14, 0.18, 0.10, 8),
  ('Caja mediana', 38, 28, 22, 40, 30, 24, 0.35, 0.25, 18),
  ('Caja grande', 55, 38, 32, 58, 40, 35, 0.75, 0.45, 30)
on conflict do nothing;

grant select, insert, update, delete on public.shipping_product_profiles to authenticated;
grant select, insert, update, delete on public.shipping_boxes to authenticated;

notify pgrst, 'reload schema';
