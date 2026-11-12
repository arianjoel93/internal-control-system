create table if not exists public.shared_sales_reports (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  seller_name text,
  title text not null,
  report_period text not null,
  report_html text not null,
  score numeric(5, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_sales_reports_owner_created_idx
on public.shared_sales_reports (owner_user_id, created_at desc);

create index if not exists shared_sales_reports_token_active_idx
on public.shared_sales_reports (token)
where is_active;

drop trigger if exists shared_sales_reports_set_updated_at on public.shared_sales_reports;
create trigger shared_sales_reports_set_updated_at
before update on public.shared_sales_reports
for each row execute function public.set_updated_at();

alter table public.shared_sales_reports enable row level security;

drop policy if exists "users create own shared sales reports" on public.shared_sales_reports;
create policy "users create own shared sales reports"
on public.shared_sales_reports for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists "users read own shared sales reports" on public.shared_sales_reports;
create policy "users read own shared sales reports"
on public.shared_sales_reports for select to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists "users update own shared sales reports" on public.shared_sales_reports;
create policy "users update own shared sales reports"
on public.shared_sales_reports for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

grant select, insert, update on public.shared_sales_reports to authenticated;
revoke all on public.shared_sales_reports from anon;

create or replace function public.get_shared_sales_report(p_token uuid)
returns table (
  id uuid,
  token uuid,
  company_name text,
  seller_name text,
  title text,
  report_period text,
  report_html text,
  score numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    report.id,
    report.token,
    report.company_name,
    report.seller_name,
    report.title,
    report.report_period,
    report.report_html,
    report.score,
    report.created_at
  from public.shared_sales_reports as report
  where report.token = p_token
    and report.is_active
  limit 1;
$$;

revoke all on function public.get_shared_sales_report(uuid) from public;
grant execute on function public.get_shared_sales_report(uuid) to anon, authenticated;

create table if not exists public.sales_agent_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seller_email text not null,
  fingerprint text not null,
  category text not null check (
    category in (
      'inactive_client',
      'declining_client',
      'low_conversion',
      'new_customer_gap',
      'expired_quotes',
      'sales_decline',
      'portfolio_concentration'
    )
  ),
  severity text not null check (severity in ('info', 'opportunity', 'warning', 'critical')),
  title text not null,
  message text not null,
  recommendation text not null,
  entity_type text not null check (entity_type in ('client', 'portfolio', 'quotation')),
  entity_key text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  dismissed_at timestamptz,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists sales_agent_notifications_user_open_idx
on public.sales_agent_notifications (user_id, is_read, last_detected_at desc)
where dismissed_at is null;

drop trigger if exists sales_agent_notifications_set_updated_at on public.sales_agent_notifications;
create trigger sales_agent_notifications_set_updated_at
before update on public.sales_agent_notifications
for each row execute function public.set_updated_at();

alter table public.sales_agent_notifications enable row level security;

drop policy if exists "agents read own sales notifications" on public.sales_agent_notifications;
create policy "agents read own sales notifications"
on public.sales_agent_notifications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "agents insert own sales notifications" on public.sales_agent_notifications;
create policy "agents insert own sales notifications"
on public.sales_agent_notifications for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "agents update own sales notifications" on public.sales_agent_notifications;
create policy "agents update own sales notifications"
on public.sales_agent_notifications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.sales_agent_notifications to authenticated;
revoke all on public.sales_agent_notifications from anon;

notify pgrst, 'reload schema';
