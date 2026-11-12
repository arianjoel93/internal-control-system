create table if not exists public.shipping_product_dimensions (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  normalized_sku text generated always as (upper(regexp_replace(trim(sku), '\s+', '', 'g'))) stored,
  product_name text,
  unit_weight_kg numeric(12, 3),
  volumetric_weight_kg numeric(12, 3),
  billable_weight_kg numeric(12, 3),
  width_cm numeric(12, 2) not null,
  length_cm numeric(12, 2) not null,
  height_cm numeric(12, 2) not null,
  source_file_name text,
  source_row integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_product_dimensions_sku_not_blank_check check (length(trim(sku)) > 0),
  constraint shipping_product_dimensions_positive_dimensions_check check (
    width_cm > 0
    and length_cm > 0
    and height_cm > 0
  ),
  constraint shipping_product_dimensions_positive_weights_check check (
    (unit_weight_kg is null or unit_weight_kg > 0)
    and (volumetric_weight_kg is null or volumetric_weight_kg > 0)
    and (billable_weight_kg is null or billable_weight_kg > 0)
  ),
  constraint shipping_product_dimensions_normalized_sku_key unique (normalized_sku)
);

create index if not exists shipping_product_dimensions_updated_at_idx
  on public.shipping_product_dimensions (updated_at desc);

drop trigger if exists shipping_product_dimensions_set_updated_at on public.shipping_product_dimensions;
create trigger shipping_product_dimensions_set_updated_at
before update on public.shipping_product_dimensions
for each row
execute function public.set_updated_at();

alter table public.shipping_product_dimensions enable row level security;

drop policy if exists "shipping users can read product dimensions" on public.shipping_product_dimensions;
create policy "shipping users can read product dimensions"
on public.shipping_product_dimensions
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permission_items items
    join public.admin_module_permissions permissions
      on permissions.id = items.permission_id
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and items.module_key = 'shipping_quotes'
      and items.can_access is true
  )
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
);

drop policy if exists "shipping admins can manage product dimensions" on public.shipping_product_dimensions;
create policy "shipping admins can manage product dimensions"
on public.shipping_product_dimensions
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active is not false
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'manager')
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
);

grant select on public.shipping_product_dimensions to authenticated;
grant insert, update, delete on public.shipping_product_dimensions to authenticated;

insert into public.shipping_product_dimensions (
  sku,
  product_name,
  width_cm,
  length_cm,
  height_cm,
  unit_weight_kg,
  volumetric_weight_kg,
  billable_weight_kg,
  source_file_name,
  source_row
)
values
  ('RT-425TT', 'RIBETEC RT-425TT IMPRESORA  4" TT/TD 203 DPI USB/ETH BCO.', 27.50, 41.00, 23.00, 3.800, 5.187, 6.000, 'Medidas y Pesos equipos Ribetec.xlsx', 2),
  ('RT-420BE', 'RIBETEC RT-420BE IMPRESORA  4" TD 203 DPI USB/ETH/BT BCO-NGO', 25.00, 34.00, 23.00, 2.500, 3.910, 4.000, 'Medidas y Pesos equipos Ribetec.xlsx', 3),
  ('RI-430TT', 'RIBETEC RI-430TT IMPRESORA  4" TT/TD 300 DPI USB/ETH', 34.00, 58.00, 38.00, 12.600, 14.987, 15.000, 'Medidas y Pesos equipos Ribetec.xlsx', 4),
  ('RE-326BE-1', 'RIBETEC RE-326BE IMPRESORA TERMICA TICKET Y RECIBOS 3" 203 DPI USB/ETH/BT NGO.', 20.00, 21.50, 15.00, 1.450, 1.290, 2.000, 'Medidas y Pesos equipos Ribetec.xlsx', 5),
  ('RT-320PB', 'RIBETEC RT-320PB IMP MOVIL 3" 203DPI USB/BT NGO/BCO.', 16.00, 18.00, 8.00, 0.650, 0.461, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 6),
  ('RM-351LU', 'RIBETEC MAMBA 351LU, LECTOR  IMAG 1D/2D USB C/BASE', 11.00, 17.50, 15.00, 0.550, 0.578, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 7),
  ('RM-352BT', 'RIBETEC MAMBA 352BT, LECTOR IMAG 1D/2D, BLUETOOTH', 11.00, 17.50, 15.00, 0.550, 0.578, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 8),
  ('RT-5500EOS', 'RIBETEC ETIQUETADORA 1 LINEA 8 DÍGITOS', 15.00, 23.00, 5.50, 0.400, 0.380, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 9),
  ('RT-6600EOS', 'RIBETEC ETIQUETADORA 2 LINEAS 20 DÍGITOS', 17.50, 25.50, 5.50, 0.500, 0.491, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 10),
  ('CUT-RT425-0001', 'RIBETEC P/RT-425TT/ KIT FULL CUTTER', 15.50, 20.00, 10.50, 0.500, 0.651, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 11),
  ('SOPORTE-420ME', 'RIBETEC P/420ME SOPORTE EXTERNO DE ETIQUETAS NEGRO', 22.00, 28.00, 5.50, 0.650, 0.678, 1.000, 'Medidas y Pesos equipos Ribetec.xlsx', 12)
on conflict (normalized_sku) do update
set
  product_name = excluded.product_name,
  width_cm = excluded.width_cm,
  length_cm = excluded.length_cm,
  height_cm = excluded.height_cm,
  unit_weight_kg = excluded.unit_weight_kg,
  volumetric_weight_kg = excluded.volumetric_weight_kg,
  billable_weight_kg = excluded.billable_weight_kg,
  source_file_name = excluded.source_file_name,
  source_row = excluded.source_row;
