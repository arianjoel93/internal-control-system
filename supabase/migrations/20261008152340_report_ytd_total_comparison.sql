-- Return only the two filtered year-to-date totals. The underlying monthly
-- function combines completed months with daily values for the open month.
create or replace function public.get_report_sales_ytd_total_comparison(
  p_source_database text,
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date,
  p_company_ids integer[] default null,
  p_seller_ids integer[] default null
)
returns table (period text, untaxed_amount numeric)
language sql
stable
set search_path = public
as $$
  select r.period, sum(r.untaxed_amount) as untaxed_amount
  from public.get_report_sales_monthly_comparison(
    p_source_database, p_current_start, p_current_end,
    p_previous_start, p_previous_end, p_company_ids, p_seller_ids
  ) r
  where r.grain = 'total'
  group by r.period
  order by r.period;
$$;

revoke all on function public.get_report_sales_ytd_total_comparison(text, date, date, date, date, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.get_report_sales_ytd_total_comparison(text, date, date, date, date, integer[], integer[])
  to service_role;
