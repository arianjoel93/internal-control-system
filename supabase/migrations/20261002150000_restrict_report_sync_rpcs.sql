revoke all on function public.claim_report_odoo_sync(text, text, text, text, interval)
  from public, anon, authenticated;
grant execute on function public.claim_report_odoo_sync(text, text, text, text, interval)
  to service_role;

revoke all on function public.finish_report_odoo_sync(
  text, text, text, text, boolean, timestamptz, date, date, integer, text
) from public, anon, authenticated;
grant execute on function public.finish_report_odoo_sync(
  text, text, text, text, boolean, timestamptz, date, date, integer, text
) to service_role;

revoke all on function public.refresh_report_sales_daily_metrics_from_facts(text, date[])
  from public, anon, authenticated;
grant execute on function public.refresh_report_sales_daily_metrics_from_facts(text, date[])
  to service_role;
