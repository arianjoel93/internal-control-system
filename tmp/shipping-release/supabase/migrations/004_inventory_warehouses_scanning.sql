create table if not exists public.inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_products
add column if not exists sku text,
add column if not exists barcode text,
add column if not exists warehouse_id uuid references public.inventory_warehouses(id) on delete set null;

create unique index if not exists inventory_products_sku_unique_idx
on public.inventory_products (sku)
where sku is not null;

create unique index if not exists inventory_products_barcode_unique_idx
on public.inventory_products (barcode)
where barcode is not null;

create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete cascade,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, warehouse_id)
);

alter table public.inventory_movements
add column if not exists warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
add column if not exists source_warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
add column if not exists destination_warehouse_id uuid references public.inventory_warehouses(id) on delete set null;

alter table public.inventory_movements
drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
add constraint inventory_movements_movement_type_check
check (movement_type in ('input', 'output', 'adjustment', 'transfer'));

alter table public.inventory_warehouses enable row level security;
alter table public.inventory_stock enable row level security;

drop policy if exists "authenticated can read inventory warehouses" on public.inventory_warehouses;
create policy "authenticated can read inventory warehouses"
on public.inventory_warehouses
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert inventory warehouses" on public.inventory_warehouses;
create policy "authenticated can insert inventory warehouses"
on public.inventory_warehouses
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update inventory warehouses" on public.inventory_warehouses;
create policy "authenticated can update inventory warehouses"
on public.inventory_warehouses
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can read inventory stock" on public.inventory_stock;
create policy "authenticated can read inventory stock"
on public.inventory_stock
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert inventory stock" on public.inventory_stock;
create policy "authenticated can insert inventory stock"
on public.inventory_stock
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update inventory stock" on public.inventory_stock;
create policy "authenticated can update inventory stock"
on public.inventory_stock
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
