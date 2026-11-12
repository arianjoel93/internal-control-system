-- Shared, backend-only reports. No auth.uid in the cache key: authorization is
-- enforced by odoo-sales-report before resolving the scoped key.
create table public.report_prepared_cache (
  cache_key text primary key,
  kind text not null check (kind in ('source', 'summary')),
  scope_key text not null,
  start_date date not null,
  end_date date not null,
  parameters jsonb not null,
  dependencies text[] not null default '{}',
  payload_gzip_base64 text,
  payload_bytes integer,
  metrics jsonb,
  source_checked_at timestamptz,
  calculated_at timestamptz,
  requested_at timestamptz not null default now(),
  stale boolean not null default true
);
create index report_prepared_dependencies on public.report_prepared_cache using gin(dependencies);
create index report_prepared_month_scope on public.report_prepared_cache(scope_key,start_date,end_date) where kind='summary';
alter table public.report_prepared_cache enable row level security;
revoke all on public.report_prepared_cache from anon, authenticated;
grant all on public.report_prepared_cache to service_role;

create table public.report_preparation_jobs (
  cache_key text primary key references public.report_prepared_cache(cache_key) on delete cascade,
  status text not null default 'pending' check(status in ('pending','running','done','failed')),
  priority integer not null default 10,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lock_token uuid,
  locked_at timestamptz,
  last_error text,
  completed_at timestamptz
);
create index report_preparation_pending on public.report_preparation_jobs(priority,available_at) where status='pending';
alter table public.report_preparation_jobs enable row level security;
revoke all on public.report_preparation_jobs from anon, authenticated;
grant all on public.report_preparation_jobs to service_role;

create function public.enqueue_report_preparation(p_key text,p_kind text,p_scope text,p_parameters jsonb,p_dependencies text[] default '{}',p_priority integer default 10)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into report_prepared_cache(cache_key,kind,scope_key,start_date,end_date,parameters,dependencies)
  values(p_key,p_kind,p_scope,(p_parameters->'filters'->>'startDate')::date,(p_parameters->'filters'->>'endDate')::date,p_parameters,p_dependencies)
  on conflict(cache_key) do update set requested_at=now();
  insert into report_preparation_jobs(cache_key,priority) values(p_key,p_priority)
  on conflict(cache_key) do update set status='pending',available_at=now(),attempts=0,priority=least(report_preparation_jobs.priority,excluded.priority)
  where report_preparation_jobs.status in ('done','failed') and (report_preparation_jobs.completed_at is null or report_preparation_jobs.completed_at < now()-interval '5 minutes');
end $$;

create function public.claim_report_preparation() returns jsonb
language plpgsql security definer set search_path=public as $$
declare k text; token uuid:=gen_random_uuid(); result jsonb;
begin
  if not pg_try_advisory_xact_lock(8624710) then return null; end if;
  if exists(select 1 from report_preparation_jobs where status='running' and locked_at>now()-interval '5 minutes') then return null; end if;
  update report_preparation_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,
    available_at=now()+interval '30 seconds',last_error='La preparación superó su tiempo máximo.'
    where status='running' and locked_at<=now()-interval '5 minutes';
  select cache_key into k from report_preparation_jobs where status='pending' and available_at<=now()
    order by priority,available_at,cache_key for update skip locked limit 1;
  if k is null then return null; end if;
  update report_preparation_jobs set status='running',locked_at=now(),lock_token=token,attempts=attempts+1 where cache_key=k;
  select to_jsonb(c)-'payload_gzip_base64'||jsonb_build_object('lock_token',token) into result from report_prepared_cache c where cache_key=k;
  return result;
end $$;

create function public.finish_report_preparation(p_key text,p_token uuid,p_payload text default null,p_bytes integer default null,p_metrics jsonb default null,p_wait boolean default false,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; checked_at timestamptz;
begin
  perform 1 from report_preparation_jobs where cache_key=p_key and lock_token=p_token and status='running' for update;
  if not found then return false; end if;
  select attempts,locked_at into n,checked_at from report_preparation_jobs where cache_key=p_key;
  if p_payload is not null then
    update report_prepared_cache set payload_gzip_base64=p_payload,payload_bytes=p_bytes,metrics=p_metrics,
      source_checked_at=checked_at,calculated_at=now(),stale=false where cache_key=p_key;
    update report_prepared_cache set stale=true where dependencies @> array[p_key];
    insert into report_preparation_jobs(cache_key,priority)
      select cache_key,20 from report_prepared_cache where dependencies @> array[p_key]
      on conflict(cache_key) do update set status='pending',available_at=now(),attempts=0 where report_preparation_jobs.status<>'running';
  elsif not p_wait and p_error is null then
    update report_prepared_cache set source_checked_at=checked_at,stale=false where cache_key=p_key;
  end if;
  update report_preparation_jobs set
    status=case when p_wait then 'pending' when p_error is not null and n<3 then 'pending' when p_error is not null then 'failed' else 'done' end,
    available_at=now()+case when p_wait then interval '20 seconds' else interval '2 minutes'*greatest(n,1) end,
    attempts=case when p_wait then greatest(attempts-1,0) else attempts end,
    lock_token=null,locked_at=null,last_error=left(p_error,1200),completed_at=case when not p_wait then now() end where cache_key=p_key;
  return true;
end $$;

create function public.dispatch_report_preparation() returns bigint
language plpgsql security definer set search_path=public,extensions as $$
declare request_id bigint;
begin
  if not exists(select 1 from report_preparation_jobs where (status='pending' and available_at<=now()) or (status='running' and locked_at<now()-interval '5 minutes')) then return null; end if;
  select net.http_post(url:='https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/report-summary-worker',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='report_analytics_publishable_key'),
      'x-report-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='report_sync_cron_token')),
    body:='{}'::jsonb,timeout_milliseconds:=1000) into request_id;
  return request_id;
end $$;

create function public.schedule_report_preparation() returns void
language plpgsql security definer set search_path=public as $$
begin
  -- Historical partitions are checked for changes, not downloaded again blindly.
  insert into report_preparation_jobs(cache_key,priority)
    select cache_key,case when kind='source' then 5 else 20 end from report_prepared_cache
    where requested_at>now()-interval '90 days'
    on conflict(cache_key) do update set status='pending',attempts=0,available_at=now(),priority=excluded.priority
    where report_preparation_jobs.status<>'running';
  perform dispatch_report_preparation();
end $$;

revoke all on function public.enqueue_report_preparation(text,text,text,jsonb,text[],integer), public.claim_report_preparation(),public.finish_report_preparation(text,uuid,text,integer,jsonb,boolean,text),public.dispatch_report_preparation(),public.schedule_report_preparation() from public,anon,authenticated;
grant execute on function public.enqueue_report_preparation(text,text,text,jsonb,text[],integer), public.claim_report_preparation(),public.finish_report_preparation(text,uuid,text,integer,jsonb,boolean,text),public.dispatch_report_preparation(),public.schedule_report_preparation() to service_role;
select cron.schedule('report-summary-worker','* * * * *','select public.dispatch_report_preparation()');
-- 08:00 UTC = 02:00 America/Mexico_City.
select cron.schedule('report-summary-nightly','0 8 * * *','select public.schedule_report_preparation()');
