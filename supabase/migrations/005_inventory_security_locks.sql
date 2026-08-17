create or replace function public.sync_inventory_product_barcode()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_code text;
begin
  normalized_code := nullif(trim(coalesce(new.barcode, '')), '');

  if normalized_code is null then
    normalized_code := nullif(trim(coalesce(new.sku, '')), '');
  end if;

  new.sku := normalized_code;
  new.barcode := normalized_code;
  new.name := trim(new.name);
  new.category := trim(new.category);
  new.brand := nullif(trim(coalesce(new.brand, '')), '');
  new.model := null;
  new.serial_number := null;
  new.warehouse_id := null;
  new.condition := 'active';
  new.notes := nullif(trim(coalesce(new.notes, '')), '');

  return new;
end;
$$;

drop trigger if exists inventory_products_sync_barcode on public.inventory_products;
create trigger inventory_products_sync_barcode
before insert or update on public.inventory_products
for each row
execute function public.sync_inventory_product_barcode();

update public.inventory_products product
set
  barcode = coalesce(nullif(trim(product.barcode), ''), nullif(trim(product.sku), '')),
  sku = coalesce(nullif(trim(product.barcode), ''), nullif(trim(product.sku), '')),
  model = null,
  serial_number = null,
  warehouse_id = null,
  condition = 'active'
where coalesce(nullif(trim(product.barcode), ''), nullif(trim(product.sku), '')) is not null
  and not exists (
    select 1
    from public.inventory_products other
    where other.id <> product.id
      and (
        nullif(trim(coalesce(other.barcode, '')), '') = coalesce(nullif(trim(product.barcode), ''), nullif(trim(product.sku), ''))
        or nullif(trim(coalesce(other.sku, '')), '') = coalesce(nullif(trim(product.barcode), ''), nullif(trim(product.sku), ''))
      )
  );

alter table public.inventory_products
drop constraint if exists inventory_products_barcode_required;

alter table public.inventory_products
add constraint inventory_products_barcode_required
check (nullif(trim(coalesce(barcode, '')), '') is not null)
not valid;

alter table public.inventory_products
drop constraint if exists inventory_products_sku_matches_barcode;

alter table public.inventory_products
add constraint inventory_products_sku_matches_barcode
check (sku is not distinct from barcode)
not valid;

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_total numeric(12, 2);
  source_stock numeric(12, 2);
begin
  if not exists (select 1 from public.inventory_warehouses where is_active = true) then
    raise exception 'Crea al menos un almacén antes de registrar movimientos.';
  end if;

  if not exists (select 1 from public.inventory_products where is_active = true) then
    raise exception 'Registra al menos un producto antes de agregar stock a un almacén.';
  end if;

  select quantity into current_total
  from public.inventory_products
  where id = new.product_id
    and is_active = true
  for update;

  if current_total is null then
    raise exception 'Producto de inventario no encontrado o inactivo.';
  end if;

  if new.movement_type in ('input', 'output', 'adjustment') then
    if not exists (
      select 1
      from public.inventory_warehouses
      where id = new.warehouse_id
        and is_active = true
    ) then
      raise exception 'Selecciona un almacén activo para registrar el movimiento.';
    end if;
  end if;

  if new.movement_type = 'transfer' then
    if new.source_warehouse_id = new.destination_warehouse_id then
      raise exception 'El almacén de origen y destino deben ser diferentes.';
    end if;

    if not exists (
      select 1
      from public.inventory_warehouses
      where id = new.source_warehouse_id
        and is_active = true
    ) or not exists (
      select 1
      from public.inventory_warehouses
      where id = new.destination_warehouse_id
        and is_active = true
    ) then
      raise exception 'Selecciona almacenes activos para transferir productos.';
    end if;
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
