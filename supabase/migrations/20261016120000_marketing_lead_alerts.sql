create table if not exists public.marketing_alert_cursors (
  scope text primary key,
  checked_at timestamptz not null default now(),
  baseline_created_at timestamptz not null default now(),
  lease_until timestamptz not null default '-infinity'::timestamptz,
  lease_token uuid
);

create table if not exists public.marketing_lead_email_deliveries (
  lead_id bigint not null,
  recipient text not null,
  lead_name text not null,
  seller_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent')),
  lease_until timestamptz not null default '-infinity'::timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  primary key (lead_id, recipient)
);

create index if not exists marketing_lead_email_deliveries_pending_idx
  on public.marketing_lead_email_deliveries (status, lease_until, created_at)
  where sent_at is null;

create table if not exists public.marketing_won_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id bigint not null,
  lead_name text not null,
  seller_name text,
  closed_at timestamptz not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (user_id, lead_id)
);

create index if not exists marketing_won_notifications_unread_idx
  on public.marketing_won_notifications (user_id, created_at)
  where delivered_at is null;

alter table public.marketing_alert_cursors enable row level security;
alter table public.marketing_lead_email_deliveries enable row level security;
alter table public.marketing_won_notifications enable row level security;
revoke all on public.marketing_alert_cursors from anon, authenticated;
revoke all on public.marketing_lead_email_deliveries from anon, authenticated;
revoke all on public.marketing_won_notifications from anon, authenticated;
grant all on public.marketing_alert_cursors to service_role;
grant all on public.marketing_lead_email_deliveries to service_role;
grant all on public.marketing_won_notifications to service_role;

insert into public.marketing_alert_cursors (scope) values ('new-leads') on conflict do nothing;

insert into public.marketing_alert_cursors (scope)
select 'won:' || user_id::text
from public.admin_module_permissions
where user_id is not null and is_active is not false
  and (role in ('owner', 'marketing_agent') or user_type = 'owner')
on conflict do nothing;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'report_analytics_publishable_key')
    and exists (select 1 from vault.secrets where name = 'report_sync_cron_token')
    and not exists (select 1 from cron.job where jobname = 'marketing-new-lead-email-scan') then
    perform cron.schedule(
      'marketing-new-lead-email-scan',
      '*/10 * * * *',
      $job$
        select net.http_post(
          url := 'https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/marketing-lead-alerts',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
            'x-report-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'report_sync_cron_token')
          ),
          body := '{"action":"scan-new-leads"}'::jsonb,
          timeout_milliseconds := 60000
        );
      $job$
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
