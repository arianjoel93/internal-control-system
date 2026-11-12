alter table public.shipping_carrier_settings
  add column if not exists final_volume_padding_enabled boolean not null default true,
  add column if not exists final_padding_length_cm numeric(12, 3) not null default 0,
  add column if not exists final_padding_width_cm numeric(12, 3) not null default 0,
  add column if not exists final_padding_height_cm numeric(12, 3) not null default 0,
  add column if not exists final_packaging_cost_enabled boolean not null default true,
  add column if not exists final_packaging_material_cost numeric(12, 2) not null default 0;
