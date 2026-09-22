create table if not exists public.report_monthly_sales_goals (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  target_amount numeric(14, 2) not null default 0 check (target_amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

create index if not exists report_monthly_sales_goals_year_month_idx
on public.report_monthly_sales_goals (year, month);

drop trigger if exists report_monthly_sales_goals_set_updated_at on public.report_monthly_sales_goals;
create trigger report_monthly_sales_goals_set_updated_at
before update on public.report_monthly_sales_goals
for each row
execute function public.set_updated_at();

alter table public.report_monthly_sales_goals enable row level security;

drop policy if exists "report users can read monthly sales goals" on public.report_monthly_sales_goals;
create policy "report users can read monthly sales goals"
on public.report_monthly_sales_goals
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permission_items permission_item
    where permission_item.user_id = (select auth.uid())
      and permission_item.module_key = 'reports'
      and permission_item.can_access = true
  )
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.can_access_reports = true
        or permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin', 'manager')
        or lower(permissions.email) in (
          'joeltrincadov@gmail.com',
          'joetectronic@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

drop policy if exists "report managers can insert monthly sales goals" on public.report_monthly_sales_goals;
create policy "report managers can insert monthly sales goals"
on public.report_monthly_sales_goals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin', 'manager')
        or lower(permissions.email) in (
          'joeltrincadov@gmail.com',
          'joetectronic@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

drop policy if exists "report managers can update monthly sales goals" on public.report_monthly_sales_goals;
create policy "report managers can update monthly sales goals"
on public.report_monthly_sales_goals
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin', 'manager')
        or lower(permissions.email) in (
          'joeltrincadov@gmail.com',
          'joetectronic@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or permissions.role in ('owner', 'admin', 'manager')
        or lower(permissions.email) in (
          'joeltrincadov@gmail.com',
          'joetectronic@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

grant select, insert, update on public.report_monthly_sales_goals to authenticated;

notify pgrst, 'reload schema';
