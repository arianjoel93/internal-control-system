create table if not exists public.report_dataset_cache (
  cache_key text primary key,
  scope_key text not null,
  payload_gzip_base64 text not null,
  payload_bytes integer not null check (payload_bytes > 0 and payload_bytes <= 8388608),
  source_fetched_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_dataset_cache_expires_at_idx
  on public.report_dataset_cache (expires_at);

alter table public.report_dataset_cache enable row level security;
revoke all on public.report_dataset_cache from anon, authenticated;
grant select, insert, update, delete on public.report_dataset_cache to service_role;

comment on table public.report_dataset_cache is
  'Caché interna de reportes Odoo. Solo la Edge Function con service_role puede leerla; nunca se expone al navegador.';
