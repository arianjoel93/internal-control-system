begin;

alter table public.shipping_product_dimensions
  add column if not exists can_rotate boolean not null default true,
  add column if not exists stackable boolean not null default true,
  add column if not exists fragile boolean not null default false,
  add column if not exists requires_individual_package boolean not null default false,
  add column if not exists can_combine boolean not null default true,
  add column if not exists packaging_group text,
  add column if not exists protection_margin_cm numeric(12,3) not null default 0,
  add column if not exists notes text;

alter table public.shipping_product_dimensions
  add constraint shipping_product_protection_nonnegative check (protection_margin_cm >= 0);

-- Existing products with unknown mass remain explicitly incomplete.
alter table public.shipping_product_dimensions
  drop constraint if exists shipping_product_dimensions_positive_weights_check;
alter table public.shipping_product_dimensions
  add constraint shipping_product_dimensions_positive_weights_check check (
    (unit_weight_kg is null or unit_weight_kg >= 0)
    and (volumetric_weight_kg is null or volumetric_weight_kg > 0)
    and (billable_weight_kg is null or billable_weight_kg > 0)
  );

-- NOT VALID preserves legacy rows, while enforcing geometry on every new save.
alter table public.shipping_package_types
  add constraint shipping_packing_box_geometry check (
    not is_active or (
      internal_length is not null and internal_width is not null and internal_height is not null
      and external_length is not null and external_width is not null and external_height is not null
      and internal_length > 0 and internal_width > 0 and internal_height > 0
      and external_length >= internal_length and external_width >= internal_width and external_height >= internal_height
      and empty_weight is not null and empty_weight >= 0 and max_weight > empty_weight
      and max_fill_percent is not null and max_fill_percent > 0 and max_fill_percent <= 100
    )
  ) not valid;

alter table public.shipping_product_dimensions enable row level security;
alter table public.shipping_package_types enable row level security;

-- Catalog writes go through shipping-quote, which checks the existing administrator permission.
revoke insert, update, delete on public.shipping_product_dimensions from anon, authenticated;
revoke insert, update, delete on public.shipping_package_types from anon, authenticated;
grant select on public.shipping_product_dimensions, public.shipping_package_types to authenticated;
grant all on public.shipping_product_dimensions, public.shipping_package_types to service_role;

notify pgrst, 'reload schema';
commit;
