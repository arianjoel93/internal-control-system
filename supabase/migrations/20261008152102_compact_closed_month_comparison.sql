-- Aggregate after applying company and seller filters, before PostgREST applies
-- its response row limit. Annual comparisons must include every closed month.
create or replace function public.get_report_sales_closed_month_comparison(
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
    select p.period, 'total'::text as grain, m.metric_month,
      0::integer as company_id, ''::text as company_name,
      0::integer as seller_id, ''::text as seller_name,
      0::integer as category_id, 'Todas las categorías'::text as category_name,
      ''::text as currency_code,
      sum(m.invoice_count)::integer as invoice_count,
      sum(m.untaxed_amount) as untaxed_amount,
      sum(m.margin_amount) as margin_amount
    from periods p
    join public.report_sales_monthly_metrics m
      on m.metric_month between p.start_date and p.end_date
      and (m.metric_month + interval '1 month - 1 day')::date <= p.end_date
    where m.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or m.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or m.seller_id = any(p_seller_ids))
    group by p.period, m.metric_month
  ),
  monthly_categories as (
    select p.period, 'category'::text as grain, c.metric_month,
      0::integer as company_id, ''::text as company_name,
      0::integer as seller_id, ''::text as seller_name,
      c.category_id, c.category_name, ''::text as currency_code,
      sum(c.invoice_count)::integer as invoice_count,
      sum(c.untaxed_amount) as untaxed_amount,
      sum(c.margin_amount) as margin_amount
    from periods p
    join public.report_sales_monthly_category_metrics c
      on c.metric_month between p.start_date and p.end_date
      and (c.metric_month + interval '1 month - 1 day')::date <= p.end_date
    where c.source_database = p_source_database
      and (coalesce(array_length(p_company_ids, 1), 0) = 0 or c.company_id = any(p_company_ids))
      and (coalesce(array_length(p_seller_ids, 1), 0) = 0 or c.seller_id = any(p_seller_ids))
    group by p.period, c.metric_month, c.category_id, c.category_name
  )
  select * from monthly_totals
  union all
  select * from monthly_categories
  order by metric_month, grain, category_id;
$$;

revoke all on function public.get_report_sales_closed_month_comparison(text, date, date, date, date, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.get_report_sales_closed_month_comparison(text, date, date, date, date, integer[], integer[])
  to service_role;
