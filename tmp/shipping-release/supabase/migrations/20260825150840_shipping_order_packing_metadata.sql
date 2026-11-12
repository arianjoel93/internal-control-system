alter table public.shipping_package_types
  add column if not exists internal_length numeric(12, 2),
  add column if not exists internal_width numeric(12, 2),
  add column if not exists internal_height numeric(12, 2),
  add column if not exists external_length numeric(12, 2),
  add column if not exists external_width numeric(12, 2),
  add column if not exists external_height numeric(12, 2),
  add column if not exists max_fill_percent numeric(5, 2),
  add column if not exists box_cost numeric(14, 2);

update public.shipping_package_types
set
  internal_length = coalesce(internal_length, length),
  internal_width = coalesce(internal_width, width),
  internal_height = coalesce(internal_height, height),
  external_length = coalesce(external_length, length),
  external_width = coalesce(external_width, width),
  external_height = coalesce(external_height, height)
where length is not null
   or width is not null
   or height is not null;

alter table public.shipping_package_types
  drop constraint if exists shipping_package_types_extended_values_check;

alter table public.shipping_package_types
  add constraint shipping_package_types_extended_values_check
  check (
    (internal_length is null or internal_length > 0)
    and (internal_width is null or internal_width > 0)
    and (internal_height is null or internal_height > 0)
    and (external_length is null or external_length > 0)
    and (external_width is null or external_width > 0)
    and (external_height is null or external_height > 0)
    and (max_fill_percent is null or (max_fill_percent > 0 and max_fill_percent <= 100))
    and (box_cost is null or box_cost >= 0)
  );

alter table public.shipping_quotes
  add column if not exists odoo_order_name text,
  add column if not exists odoo_order_id bigint,
  add column if not exists selected_packing_plan jsonb,
  add column if not exists packing_source text not null default 'MANUAL';

create index if not exists shipping_quotes_odoo_order_name_idx
  on public.shipping_quotes (odoo_order_name);

notify pgrst, 'reload schema';
