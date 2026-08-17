create table if not exists public.inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  barcode text unique,
  name text not null,
  category text not null,
  brand text,
  model text,
  serial_number text,
  warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  unit text not null default 'pieza' check (unit in ('pieza', 'metro', 'equipo', 'caja')),
  condition text not null default 'active' check (condition in ('active', 'bone', 'inactive')),
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  minimum_stock numeric(12, 2) not null default 0 check (minimum_stock >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete cascade,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (product_id, warehouse_id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  source_warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  destination_warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  movement_type text not null check (movement_type in ('input', 'output', 'adjustment', 'transfer')),
  quantity numeric(12, 2) not null check (quantity > 0),
  previous_quantity numeric(12, 2),
  next_quantity numeric(12, 2),
  reason text,
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  check (
    (movement_type in ('input', 'output', 'adjustment') and warehouse_id is not null)
    or
    (movement_type = 'transfer' and source_warehouse_id is not null and destination_warehouse_id is not null and source_warehouse_id <> destination_warehouse_id)
  )
);

create index if not exists inventory_products_search_idx
on public.inventory_products using gin (
  (coalesce(sku, '') || ' ' || coalesce(barcode, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serial_number, '')) gin_trgm_ops
);

create index if not exists inventory_products_active_category_idx
on public.inventory_products (is_active, category, name);

create index if not exists inventory_stock_lookup_idx
on public.inventory_stock (product_id, warehouse_id);

create index if not exists inventory_movements_product_date_idx
on public.inventory_movements (product_id, created_at desc);

drop trigger if exists inventory_warehouses_set_updated_at on public.inventory_warehouses;
create trigger inventory_warehouses_set_updated_at
before update on public.inventory_warehouses
for each row
execute function public.set_updated_at();

drop trigger if exists inventory_products_set_updated_at on public.inventory_products;
create trigger inventory_products_set_updated_at
before update on public.inventory_products
for each row
execute function public.set_updated_at();

create or replace function public.touch_inventory_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_stock_set_updated_at on public.inventory_stock;
create trigger inventory_stock_set_updated_at
before update on public.inventory_stock
for each row
execute function public.touch_inventory_stock();

create or replace function public.recalculate_inventory_product_quantity(target_product_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.inventory_products
  set quantity = coalesce((
    select sum(quantity)
    from public.inventory_stock
    where product_id = target_product_id
  ), 0)
  where id = target_product_id;
end;
$$;

create or replace function public.add_inventory_stock(
  target_product_id uuid,
  target_warehouse_id uuid,
  stock_delta numeric
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  next_stock numeric(12, 2);
begin
  insert into public.inventory_stock (product_id, warehouse_id, quantity)
  values (target_product_id, target_warehouse_id, greatest(stock_delta, 0))
  on conflict (product_id, warehouse_id)
  do update set quantity = public.inventory_stock.quantity + stock_delta
  returning quantity into next_stock;

  if next_stock < 0 then
    raise exception 'No hay existencia suficiente en el almacén seleccionado.';
  end if;

  perform public.recalculate_inventory_product_quantity(target_product_id);
  return next_stock;
end;
$$;

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_total numeric(12, 2);
  source_stock numeric(12, 2);
begin
  select quantity into current_total
  from public.inventory_products
  where id = new.product_id
  for update;

  if current_total is null then
    raise exception 'Producto de inventario no encontrado.';
  end if;

  new.previous_quantity := current_total;

  if new.movement_type = 'input' then
    perform public.add_inventory_stock(new.product_id, new.warehouse_id, new.quantity);
  elsif new.movement_type = 'output' then
    perform public.add_inventory_stock(new.product_id, new.warehouse_id, -new.quantity);
  elsif new.movement_type = 'adjustment' then
    insert into public.inventory_stock (product_id, warehouse_id, quantity)
    values (new.product_id, new.warehouse_id, new.quantity)
    on conflict (product_id, warehouse_id)
    do update set quantity = excluded.quantity;
    perform public.recalculate_inventory_product_quantity(new.product_id);
  else
    select quantity into source_stock
    from public.inventory_stock
    where product_id = new.product_id
      and warehouse_id = new.source_warehouse_id
    for update;

    if coalesce(source_stock, 0) < new.quantity then
      raise exception 'No hay existencia suficiente para transferir.';
    end if;

    perform public.add_inventory_stock(new.product_id, new.source_warehouse_id, -new.quantity);
    perform public.add_inventory_stock(new.product_id, new.destination_warehouse_id, new.quantity);
  end if;

  select quantity into new.next_quantity
  from public.inventory_products
  where id = new.product_id;

  return new;
end;
$$;

drop trigger if exists inventory_movements_apply_stock on public.inventory_movements;
create trigger inventory_movements_apply_stock
before insert on public.inventory_movements
for each row
execute function public.apply_inventory_movement();

alter table public.inventory_warehouses enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_movements enable row level security;

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

drop policy if exists "authenticated can read inventory products" on public.inventory_products;
create policy "authenticated can read inventory products"
on public.inventory_products
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert inventory products" on public.inventory_products;
create policy "authenticated can insert inventory products"
on public.inventory_products
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update inventory products" on public.inventory_products;
create policy "authenticated can update inventory products"
on public.inventory_products
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

drop policy if exists "authenticated can read inventory movements" on public.inventory_movements;
create policy "authenticated can read inventory movements"
on public.inventory_movements
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert inventory movements" on public.inventory_movements;
create policy "authenticated can insert inventory movements"
on public.inventory_movements
for insert
to authenticated
with check (auth.role() = 'authenticated');
