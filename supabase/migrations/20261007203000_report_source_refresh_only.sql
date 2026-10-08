-- Monthly invoice aggregates remain on their existing cron. The source cache
-- refreshes at night; the experimental complete snapshot is not retried.
create or replace function public.schedule_report_preparation() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into report_preparation_jobs(cache_key,priority)
    select cache_key,5 from report_prepared_cache
    where kind='source' and requested_at>now()-interval '90 days'
    on conflict(cache_key) do update set status='pending',attempts=0,
      available_at=now(),priority=5
    where report_preparation_jobs.status<>'running';
  perform dispatch_report_preparation();
end $$;
