create table if not exists public.report_agent_historical_baselines (
  odoo_source text not null,
  company_id bigint not null,
  seller_id bigint not null,
  as_of_date date not null,
  dimension text not null check (dimension in ('customer', 'product')),
  dimension_key text not null,
  total_amount numeric(20, 2) not null,
  purchase_count integer not null check (purchase_count >= 0),
  sync_token uuid not null default gen_random_uuid(),
  refreshed_at timestamptz not null default now(),
  primary key (odoo_source, company_id, seller_id, as_of_date, dimension, dimension_key)
);

create index if not exists report_agent_historical_baselines_lookup_idx
on public.report_agent_historical_baselines (seller_id, company_id, as_of_date, dimension);

alter table public.report_agent_historical_baselines enable row level security;

revoke all on public.report_agent_historical_baselines from anon, authenticated;
grant select, insert, update, delete on public.report_agent_historical_baselines to service_role;

notify pgrst, 'reload schema';
