revoke all on function public.get_report_sales_daily_comparison(text, date, date, date, date, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.get_report_sales_daily_comparison(text, date, date, date, date, integer[], integer[])
  to service_role;
