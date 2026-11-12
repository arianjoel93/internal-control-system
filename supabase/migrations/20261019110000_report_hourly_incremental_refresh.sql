-- Hourly change detection refreshes only affected invoice months. The existing
-- 00:15 full aggregate reconciliation remains the recovery path for moved dates.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'report-odoo-analytics-hourly') then
    perform cron.schedule(
      'report-odoo-analytics-hourly',
      '30 * * * *',
      $job$
        select net.http_post(
          url := 'https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/sync-odoo-analytics',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'x-report-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'report_sync_cron_token')
          ),
          body := '{"refreshMode":"incremental"}'::jsonb,
          timeout_milliseconds := 60000
        );
      $job$
    );
  end if;
end;
$$;

-- Revalidate only recently used source partitions touching the current month.
-- Historical partitions remain on the existing nightly reconciliation.
create or replace function public.schedule_report_preparation_hourly() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into report_preparation_jobs(cache_key,priority)
    select cache_key,5 from report_prepared_cache
    where kind='source'
      and end_date >= date_trunc('month', now() at time zone 'America/Mexico_City')::date
      and start_date <= (now() at time zone 'America/Mexico_City')::date
      and requested_at > now()-interval '14 days'
    on conflict(cache_key) do update set status='pending',attempts=0,
      available_at=now(),priority=5
    where report_preparation_jobs.status<>'running';
  perform dispatch_report_preparation();
end $$;

revoke all on function public.schedule_report_preparation_hourly() from public, anon, authenticated;
grant execute on function public.schedule_report_preparation_hourly() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'report-summary-hourly') then
    perform cron.schedule('report-summary-hourly','40 * * * *',
      'select public.schedule_report_preparation_hourly()');
  end if;
end;
$$;

-- Workers can legitimately run longer than five minutes; the Supabase paid
-- wall-clock limit is under eight minutes. Do not steal an active worker lock.
create or replace function public.claim_report_preparation() returns jsonb
language plpgsql security definer set search_path=public as $$
declare k text; token uuid:=gen_random_uuid(); result jsonb;
begin
  if not pg_try_advisory_xact_lock(8624710) then return null; end if;
  if exists(select 1 from report_preparation_jobs where status='running' and locked_at>now()-interval '8 minutes') then return null; end if;
  update report_preparation_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,
    available_at=now()+interval '30 seconds',last_error='La preparación superó su tiempo máximo.'
    where status='running' and locked_at<=now()-interval '8 minutes';
  select cache_key into k from report_preparation_jobs where status='pending' and available_at<=now()
    order by priority,available_at,cache_key for update skip locked limit 1;
  if k is null then return null; end if;
  update report_preparation_jobs set status='running',locked_at=now(),lock_token=token,attempts=attempts+1 where cache_key=k;
  select to_jsonb(c)-'payload_gzip_base64'||jsonb_build_object('lock_token',token) into result from report_prepared_cache c where cache_key=k;
  return result;
end $$;

revoke all on function public.claim_report_preparation() from public, anon, authenticated;
grant execute on function public.claim_report_preparation() to service_role;

-- Failed summaries from the former oversized merged-payload path can retry
-- once through direct source-partition processing. Keep failed merged records
-- for diagnosis; they are no longer a dependency of new summary runs.
update public.report_preparation_jobs j set status='pending',attempts=0,
  available_at=now(),last_error=null
from public.report_prepared_cache c
where c.cache_key=j.cache_key and c.kind='summary' and j.status='failed';
