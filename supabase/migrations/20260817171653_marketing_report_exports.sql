create table if not exists public.marketing_report_exports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Reporte ejecutivo de Marketing',
  period_start date not null,
  period_end date not null,
  period_label text not null,
  report_html text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_report_exports_created_by_idx
on public.marketing_report_exports (created_by, created_at desc);

create index if not exists marketing_report_exports_period_idx
on public.marketing_report_exports (period_start, period_end);

alter table public.marketing_report_exports enable row level security;

drop policy if exists "marketing reports read own or owner" on public.marketing_report_exports;
create policy "marketing reports read own or owner"
on public.marketing_report_exports for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.role = 'owner'
        or permissions.user_type = 'owner'
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
);

drop policy if exists "marketing reports insert own" on public.marketing_report_exports;
create policy "marketing reports insert own"
on public.marketing_report_exports for insert
to authenticated
with check (created_by = (select auth.uid()));

grant select, insert on public.marketing_report_exports to authenticated;
revoke all on public.marketing_report_exports from anon;

notify pgrst, 'reload schema';
