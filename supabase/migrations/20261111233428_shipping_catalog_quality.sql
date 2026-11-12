begin;

-- Unknown dimensions remain NULL. Zero is never a placeholder measurement.
alter table public.shipping_product_dimensions
  alter column width_cm drop not null,
  alter column length_cm drop not null,
  alter column height_cm drop not null,
  add column if not exists logistics_metadata jsonb not null default '{}'::jsonb;

alter table public.shipping_product_dimensions
  add constraint shipping_catalog_metadata_object check (jsonb_typeof(logistics_metadata) = 'object');

-- Existing positive-dimension checks accept NULL and continue rejecting zero.
-- Existing RLS and administrator-only Edge Function writes are preserved.
comment on column public.shipping_product_dimensions.logistics_metadata is
  'Per-field origin, estimation methods, source sheet and confidence. Empty metadata means legacy/unknown, not measured.';

notify pgrst, 'reload schema';
commit;
