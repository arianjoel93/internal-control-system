-- Limit hourly source checks to partitions used in the last three days.
-- The existing nightly job still reconciles the broader shared cache.
create or replace function public.schedule_report_preparation_hourly() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into report_preparation_jobs(cache_key,priority)
    select cache_key,5 from report_prepared_cache
    where kind='source'
      and payload_gzip_base64 is not null
      and end_date >= date_trunc('month', now() at time zone 'America/Mexico_City')::date
      and start_date <= (now() at time zone 'America/Mexico_City')::date
      and requested_at > now()-interval '3 days'
    on conflict(cache_key) do update set status='pending',attempts=0,
      available_at=now(),priority=5
    where report_preparation_jobs.status<>'running';
  perform dispatch_report_preparation();
end $$;

revoke all on function public.schedule_report_preparation_hourly() from public, anon, authenticated;
grant execute on function public.schedule_report_preparation_hourly() to service_role;
