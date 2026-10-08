create table if not exists public.report_sales_daily_metrics (
  source_database text not null,
  metric_date date not null,
  company_id integer,
  company_name text,
  seller_id integer,
  seller_name text,
  currency_code text,
  invoice_count integer not null default 0,
  untaxed_amount numeric(18, 4) not null default 0,
  margin_amount numeric(18, 4) not null default 0,
  source_fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_database, metric_date, company_id, seller_id, currency_code)
);

create table if not exists public.report_odoo_sync_state (
  source_database text not null,
  sync_key text not null,
  model_name text not null,
  last_sync_at timestamptz,
  last_write_date timestamptz,
  synced_start_date date,
  synced_end_date date,
  row_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (source_database, sync_key, model_name)
);

create index if not exists report_sales_daily_metrics_date_idx
  on public.report_sales_daily_metrics (metric_date);

create index if not exists report_sales_daily_metrics_company_seller_date_idx
  on public.report_sales_daily_metrics (company_id, seller_id, metric_date);

create index if not exists report_sales_daily_metrics_source_date_idx
  on public.report_sales_daily_metrics (source_database, metric_date);

create index if not exists report_odoo_sync_state_updated_idx
  on public.report_odoo_sync_state (updated_at);

alter table public.report_sales_daily_metrics enable row level security;
alter table public.report_odoo_sync_state enable row level security;

revoke all on public.report_sales_daily_metrics from anon, authenticated;
revoke all on public.report_odoo_sync_state from anon, authenticated;
grant select, insert, update, delete on public.report_sales_daily_metrics to service_role;
grant select, insert, update, delete on public.report_odoo_sync_state to service_role;

create or replace function public.get_report_sales_daily_comparison(
  p_source_database text,
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date,
  p_company_ids integer[] default null,
  p_seller_ids integer[] default null
)
returns table (
  period text,
  metric_date date,
  day_index integer,
  untaxed_amount numeric,
  margin_amount numeric,
  invoice_count integer
)
language sql
stable
set search_path = public
as $$
  with current_rows as (
    select
      'current'::text as period,
      metric_date,
      (metric_date - p_current_start)::integer as day_index,
      sum(untaxed_amount)::numeric as untaxed_amount,
      sum(margin_amount)::numeric as margin_amount,
      sum(invoice_count)::integer as invoice_count
    from public.report_sales_daily_metrics
    where source_database = p_source_database
      and metric_date between p_current_start and p_current_end
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or seller_id = any(p_seller_ids))
    group by metric_date
  ),
  previous_bounds as (
    select greatest((p_previous_end - p_previous_start + 1), 1)::numeric as previous_days,
      greatest((p_current_end - p_current_start + 1), 1)::numeric as current_days
  ),
  previous_rows as (
    select
      'previous'::text as period,
      metric_date,
      least(
        greatest((p_current_end - p_current_start)::integer, 0),
        floor((((metric_date - p_previous_start)::numeric + 0.5) * current_days) / previous_days)::integer
      ) as day_index,
      sum(untaxed_amount)::numeric as untaxed_amount,
      sum(margin_amount)::numeric as margin_amount,
      sum(invoice_count)::integer as invoice_count
    from public.report_sales_daily_metrics
    cross join previous_bounds
    where source_database = p_source_database
      and metric_date between p_previous_start and p_previous_end
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or seller_id = any(p_seller_ids))
    group by metric_date, current_days, previous_days
  )
  select * from current_rows
  union all
  select * from previous_rows
  order by period, day_index, metric_date;
$$;

revoke all on function public.get_report_sales_daily_comparison(text, date, date, date, date, integer[], integer[]) from public;
grant execute on function public.get_report_sales_daily_comparison(text, date, date, date, date, integer[], integer[]) to service_role;

comment on table public.report_sales_daily_metrics is
  'Agregados diarios internos de Contabilidad > Análisis de facturas de Odoo para acelerar comparativos de Reportes.';

comment on table public.report_odoo_sync_state is
  'Estado interno de sincronización/cobertura de Odoo para reportes. Solo se usa desde Edge Functions con service_role.';
