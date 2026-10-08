create table if not exists public.report_sales_daily_category_metrics (
  source_database text not null,
  metric_date date not null,
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
  primary key (source_database, metric_date, company_id, seller_id, category_id, currency_code)
);

create index if not exists report_sales_daily_category_filter_idx
  on public.report_sales_daily_category_metrics (source_database, company_id, seller_id, metric_date);

alter table public.report_sales_daily_category_metrics enable row level security;
revoke all on public.report_sales_daily_category_metrics from anon, authenticated;
grant select, insert, update, delete on public.report_sales_daily_category_metrics to service_role;

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
  with periods as (
    select 'current'::text as period, p_current_start as start_date, p_current_end as end_date
    union all
    select 'previous'::text, p_previous_start, p_previous_end
  ),
  monthly_totals as (
    select
      p.period, 'total'::text as grain, m.metric_month,
      m.company_id, m.company_name, m.seller_id, m.seller_name,
      0::integer as category_id, 'Todas las categorías'::text as category_name,
      m.currency_code, m.invoice_count, m.untaxed_amount, m.margin_amount
    from periods p
    join public.report_sales_monthly_metrics m
      on m.metric_month >= p.start_date
      and (m.metric_month + interval '1 month - 1 day')::date <= p.end_date
    where m.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or m.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or m.seller_id = any(p_seller_ids))
  ),
  monthly_categories as (
    select
      p.period, 'category'::text as grain, c.metric_month,
      c.company_id, c.company_name, c.seller_id, c.seller_name,
      c.category_id, c.category_name, c.currency_code,
      c.invoice_count, c.untaxed_amount, c.margin_amount
    from periods p
    join public.report_sales_monthly_category_metrics c
      on c.metric_month >= p.start_date
      and (c.metric_month + interval '1 month - 1 day')::date <= p.end_date
    where c.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or c.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or c.seller_id = any(p_seller_ids))
  ),
  partial_daily_totals as (
    select
      p.period, 'total'::text as grain, date_trunc('month', d.metric_date)::date as metric_month,
      d.company_id, d.company_name, d.seller_id, d.seller_name,
      0::integer as category_id, 'Todas las categorías'::text as category_name,
      d.currency_code, sum(d.invoice_count)::integer as invoice_count,
      sum(d.untaxed_amount)::numeric as untaxed_amount,
      sum(d.margin_amount)::numeric as margin_amount
    from periods p
    join public.report_sales_daily_metrics d
      on d.metric_date between p.start_date and p.end_date
      and (
        p.start_date > date_trunc('month', d.metric_date)::date
        or p.end_date < (date_trunc('month', d.metric_date) + interval '1 month - 1 day')::date
      )
    where d.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or d.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or d.seller_id = any(p_seller_ids))
    group by p.period, date_trunc('month', d.metric_date), d.company_id, d.company_name,
      d.seller_id, d.seller_name, d.currency_code
  ),
  partial_daily_categories as (
    select
      p.period, 'category'::text as grain, date_trunc('month', d.metric_date)::date as metric_month,
      d.company_id, d.company_name, d.seller_id, d.seller_name,
      d.category_id, d.category_name, d.currency_code,
      sum(d.invoice_count)::integer as invoice_count,
      sum(d.untaxed_amount)::numeric as untaxed_amount,
      sum(d.margin_amount)::numeric as margin_amount
    from periods p
    join public.report_sales_daily_category_metrics d
      on d.metric_date between p.start_date and p.end_date
      and (
        p.start_date > date_trunc('month', d.metric_date)::date
        or p.end_date < (date_trunc('month', d.metric_date) + interval '1 month - 1 day')::date
      )
    where d.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or d.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or d.seller_id = any(p_seller_ids))
    group by p.period, date_trunc('month', d.metric_date), d.company_id, d.company_name,
      d.seller_id, d.seller_name, d.category_id, d.category_name, d.currency_code
  )
  select * from monthly_totals
  union all select * from monthly_categories
  union all select * from partial_daily_totals
  union all select * from partial_daily_categories
  order by metric_month, grain, company_id, seller_id, category_id;
$$;

revoke all on function public.get_report_sales_monthly_comparison(text, date, date, date, date, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.get_report_sales_monthly_comparison(text, date, date, date, date, integer[], integer[])
  to service_role;

comment on table public.report_sales_daily_category_metrics is
  'Agregados diarios por categoría, compañía y vendedor para comparar meses parciales contra las mismas fechas del año anterior.';
