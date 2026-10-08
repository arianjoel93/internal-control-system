-- A merged source is reused by every dashboard configuration for the same
-- company/seller scope and date range. Keeping it separate bounds Edge CPU.
alter table public.report_prepared_cache
  drop constraint report_prepared_cache_kind_check;
alter table public.report_prepared_cache
  add constraint report_prepared_cache_kind_check
  check (kind in ('source', 'merged', 'summary'));

create or replace function public.schedule_report_preparation() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into report_preparation_jobs(cache_key,priority)
    select cache_key,case kind when 'source' then 5 when 'merged' then 10 else 20 end
    from report_prepared_cache
    where requested_at>now()-interval '90 days'
    on conflict(cache_key) do update set status='pending',attempts=0,
      available_at=now(),priority=excluded.priority
    where report_preparation_jobs.status<>'running';
  perform dispatch_report_preparation();
end $$;

create function public.prime_report_preparation() returns bigint
language plpgsql security definer set search_path=public,extensions as $$
declare request_id bigint;
begin
  select net.http_post(
    url:='https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/report-summary-worker',
    headers:=jsonb_build_object('Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='report_analytics_publishable_key'),
      'x-report-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='report_sync_cron_token')),
    body:='{"bootstrap":true}'::jsonb,timeout_milliseconds:=1000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.prime_report_preparation() from public,anon,authenticated;
grant execute on function public.prime_report_preparation() to service_role;
select cron.schedule('report-summary-prime','5 8 * * *','select public.prime_report_preparation()');
