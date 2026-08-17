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
  current_stock numeric(12, 2);
  next_stock numeric(12, 2);
begin
  select quantity into current_stock
  from public.inventory_stock
  where product_id = target_product_id
    and warehouse_id = target_warehouse_id
  for update;

  if current_stock is null then
    if stock_delta < 0 then
      raise exception 'No hay existencia suficiente en el almacén seleccionado.';
    end if;

    insert into public.inventory_stock (product_id, warehouse_id, quantity)
    values (target_product_id, target_warehouse_id, stock_delta)
    returning quantity into next_stock;
  else
    next_stock := current_stock + stock_delta;

    if next_stock < 0 then
      raise exception 'No hay existencia suficiente en el almacén seleccionado.';
    end if;

    update public.inventory_stock
    set quantity = next_stock
    where product_id = target_product_id
      and warehouse_id = target_warehouse_id;
  end if;

  perform public.recalculate_inventory_product_quantity(target_product_id);
  return next_stock;
end;
$$;

notify pgrst, 'reload schema';
