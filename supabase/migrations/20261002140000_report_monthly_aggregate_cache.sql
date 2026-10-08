create table if not exists public.report_sales_monthly_metrics (
  source_database text not null,
  metric_month date not null,
  company_id integer not null default 0,
  company_name text,
  seller_id integer not null default 0,
  seller_name text,
  currency_code text not null default 'MXN',
  invoice_count integer not null default 0,
  untaxed_amount numeric(20, 4) not null default 0,
  margin_amount numeric(20, 4) not null default 0,
  source_fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_database, metric_month, company_id, seller_id, currency_code)
);

create table if not exists public.report_sales_monthly_category_metrics (
  source_database text not null,
  metric_month date not null,
  company_id integer not null default 0,
  company_name text,
  seller_id integer not null default 0,
  seller_name text,
  category_id integer not null default 0,
  category_name text not null default 'Sin categoría',
  currency_code text not null default 'MXN',
  invoice_count integer not null default 0,
  untaxed_amount numeric(20, 4) not null default 0,
  margin_amount numeric(20, 4) not null default 0,
  source_fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_database, metric_month, company_id, seller_id, category_id, currency_code)
);

create index if not exists report_sales_monthly_metrics_filter_idx
  on public.report_sales_monthly_metrics (source_database, metric_month, company_id, seller_id);

create index if not exists report_sales_monthly_category_filter_idx
  on public.report_sales_monthly_category_metrics (source_database, metric_month, company_id, seller_id, category_id);

alter table public.report_sales_monthly_metrics enable row level security;
alter table public.report_sales_monthly_category_metrics enable row level security;
revoke all on public.report_sales_monthly_metrics from anon, authenticated;
revoke all on public.report_sales_monthly_category_metrics from anon, authenticated;
grant select, insert, update, delete on public.report_sales_monthly_metrics to service_role;
grant select, insert, update, delete on public.report_sales_monthly_category_metrics to service_role;

create or replace function public.get_report_sales_monthly_comparison(
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
  grain text,
  metric_month date,
  company_id integer,
  company_name text,
  seller_id integer,
  seller_name text,
  category_id integer,
  category_name text,
  currency_code text,
  invoice_count integer,
  untaxed_amount numeric,
  margin_amount numeric
)
language sql
stable
set search_path = public
as $$
  select
    case when m.metric_month between p_current_start and p_current_end then 'current' else 'previous' end,
    'total'::text,
    m.metric_month,
    m.company_id,
    m.company_name,
    m.seller_id,
    m.seller_name,
    0,
    'Todas las categorías'::text,
    m.currency_code,
    m.invoice_count,
    m.untaxed_amount,
    m.margin_amount
  from public.report_sales_monthly_metrics m
  where m.source_database = p_source_database
    and ((m.metric_month between p_current_start and p_current_end)
      or (m.metric_month between p_previous_start and p_previous_end))
    and (coalesce(array_length(p_company_ids, 1), 0) = 0 or m.company_id = any(p_company_ids))
    and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or m.seller_id = any(p_seller_ids))
  union all
  select
    case when c.metric_month between p_current_start and p_current_end then 'current' else 'previous' end,
    'category'::text,
    c.metric_month,
    c.company_id,
    c.company_name,
    c.seller_id,
    c.seller_name,
    c.category_id,
    c.category_name,
    c.currency_code,
    c.invoice_count,
    c.untaxed_amount,
    c.margin_amount
  from public.report_sales_monthly_category_metrics c
  where c.source_database = p_source_database
    and ((c.metric_month between p_current_start and p_current_end)
      or (c.metric_month between p_previous_start and p_previous_end))
    and (coalesce(array_length(p_company_ids, 1), 0) = 0 or c.company_id = any(p_company_ids))
    and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or c.seller_id = any(p_seller_ids))
  order by 3, 2, 4, 6, 8;
$$;

revoke all on function public.get_report_sales_monthly_comparison(text, date, date, date, date, integer[], integer[]) from public, anon, authenticated;
grant execute on function public.get_report_sales_monthly_comparison(text, date, date, date, date, integer[], integer[]) to service_role;

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'report_sync_cron_token') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'report_sync_cron_token');
  end if;
end;
$$;

create or replace function public.get_report_sync_cron_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'report_sync_cron_token'
  limit 1;
$$;

revoke all on function public.get_report_sync_cron_token() from public, anon, authenticated;
grant execute on function public.get_report_sync_cron_token() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'report_analytics_publishable_key') then
    raise exception 'Guarda la llave anon pública en Vault con el nombre report_analytics_publishable_key antes de programar el Cron.';
  end if;

  if not exists (select 1 from cron.job where jobname = 'report-odoo-analytics-nightly') then
    perform cron.schedule(
      'report-odoo-analytics-nightly',
      '15 6 * * *',
      $job$
        select net.http_post(
          url := 'https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/sync-odoo-analytics',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'x-report-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'report_sync_cron_token')
          ),
          body := '{"scheduled":true}'::jsonb,
          timeout_milliseconds := 60000
        );
      $job$
    );
  end if;
end;
$$;

comment on table public.report_sales_monthly_metrics is
  'Agregados mensuales compartidos de Análisis de facturas de Odoo para el dashboard de Reportes.';
comment on table public.report_sales_monthly_category_metrics is
  'Agregados mensuales por categoría, compañía y vendedor; conserva margen y ventas sin detalle de factura.';
