-- Retire obsolete precomputed summaries requested more than seven days ago.
-- They were never published and otherwise keep retrying large historical merges.
-- Current, user-requested summaries can still be enqueued normally.
update public.report_preparation_jobs j
set status = 'failed', lock_token = null, locked_at = null,
    last_error = 'Preparación anterior vencida; solicita nuevamente el reporte para actualizarla.'
from public.report_prepared_cache c
where c.cache_key = j.cache_key
  and c.kind in ('summary', 'merged')
  and c.requested_at < now() - interval '7 days'
  and j.status in ('pending', 'failed');

create or replace function public.claim_report_preparation() returns jsonb
language plpgsql security definer set search_path=public as $$
declare k text; token uuid:=gen_random_uuid(); result jsonb;
begin
  if not pg_try_advisory_xact_lock(8624710) then return null; end if;
  if exists(select 1 from report_preparation_jobs where status='running' and locked_at>now()-interval '8 minutes') then return null; end if;
  update report_preparation_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,
    available_at=now()+interval '30 seconds',last_error='La preparación superó su tiempo máximo.'
    where status='running' and locked_at<=now()-interval '8 minutes';
  select j.cache_key into k from report_preparation_jobs j
    join report_prepared_cache c on c.cache_key=j.cache_key
    where j.status='pending' and j.available_at<=now()
      and (c.kind='source' or c.requested_at>now()-interval '7 days')
    order by j.priority,j.available_at,j.cache_key for update of j skip locked limit 1;
  if k is null then return null; end if;
  update report_preparation_jobs set status='running',locked_at=now(),lock_token=token,attempts=attempts+1 where cache_key=k;
  select to_jsonb(c)-'payload_gzip_base64'||jsonb_build_object('lock_token',token) into result from report_prepared_cache c where cache_key=k;
  return result;
end $$;

revoke all on function public.claim_report_preparation() from public, anon, authenticated;
grant execute on function public.claim_report_preparation() to service_role;

create or replace function public.dispatch_report_preparation() returns bigint
language plpgsql security definer set search_path=public,extensions as $$
declare request_id bigint;
begin
  if not exists(select 1 from report_preparation_jobs j
    join report_prepared_cache c on c.cache_key=j.cache_key
    where ((j.status='pending' and j.available_at<=now())
      or (j.status='running' and j.locked_at<now()-interval '8 minutes'))
      and (c.kind='source' or c.requested_at>now()-interval '7 days'))
  then return null; end if;
  select net.http_post(url:='https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/report-summary-worker',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='report_analytics_publishable_key'),
      'x-report-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='report_sync_cron_token')),
    body:='{}'::jsonb,timeout_milliseconds:=1000) into request_id;
  return request_id;
end $$;

revoke all on function public.dispatch_report_preparation() from public, anon, authenticated;
grant execute on function public.dispatch_report_preparation() to service_role;
