alter table public.inventory_products
add column if not exists required_quantity numeric(12, 2) not null default 0 check (required_quantity >= 0);

create table if not exists public.inventory_movement_batches (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('input', 'output', 'adjustment', 'transfer')),
  warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  source_warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  destination_warehouse_id uuid references public.inventory_warehouses(id) on delete set null,
  item_count integer not null default 0 check (item_count >= 0),
  total_quantity numeric(12, 2) not null default 0 check (total_quantity >= 0),
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

alter table public.inventory_movements
add column if not exists batch_id uuid references public.inventory_movement_batches(id) on delete cascade;

create index if not exists inventory_movement_batches_created_idx
on public.inventory_movement_batches (created_at desc);

create index if not exists inventory_movements_batch_idx
on public.inventory_movements (batch_id, created_at desc);

create or replace function public.refresh_inventory_movement_batch_totals(target_batch_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if target_batch_id is null then
    return;
  end if;

  update public.inventory_movement_batches
  set
    item_count = coalesce((
      select count(*)::integer
      from public.inventory_movements
      where batch_id = target_batch_id
    ), 0),
    total_quantity = coalesce((
      select sum(quantity)
      from public.inventory_movements
      where batch_id = target_batch_id
    ), 0)
  where id = target_batch_id;
end;
$$;

create or replace function public.inventory_movements_refresh_batch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_inventory_movement_batch_totals(new.batch_id);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_inventory_movement_batch_totals(old.batch_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists inventory_movements_refresh_batch_totals on public.inventory_movements;
create trigger inventory_movements_refresh_batch_totals
after insert or update or delete on public.inventory_movements
for each row
execute function public.inventory_movements_refresh_batch();

alter table public.inventory_movement_batches enable row level security;

drop policy if exists "authenticated can read inventory movement batches" on public.inventory_movement_batches;
create policy "authenticated can read inventory movement batches"
on public.inventory_movement_batches
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert inventory movement batches" on public.inventory_movement_batches;
create policy "authenticated can insert inventory movement batches"
on public.inventory_movement_batches
for insert
to authenticated
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update inventory movement batches" on public.inventory_movement_batches;
create policy "authenticated can update inventory movement batches"
on public.inventory_movement_batches
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can delete inventory movement batches" on public.inventory_movement_batches;
create policy "authenticated can delete inventory movement batches"
on public.inventory_movement_batches
for delete
to authenticated
using (auth.role() = 'authenticated');

grant select, insert, update, delete on public.inventory_movement_batches to authenticated;

notify pgrst, 'reload schema';
