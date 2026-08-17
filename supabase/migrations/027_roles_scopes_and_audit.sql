alter table public.admin_module_permissions
  add column if not exists full_name text,
  add column if not exists role text not null default 'manager',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists odoo_user_id bigint,
  add column if not exists odoo_partner_id bigint,
  add column if not exists odoo_salesperson_id bigint,
  add column if not exists odoo_email text,
  add column if not exists odoo_link_status text not null default 'unlinked',
  add column if not exists odoo_linked_at timestamptz;

alter table public.admin_module_permissions
  drop constraint if exists admin_module_permissions_role_check;

alter table public.admin_module_permissions
  add constraint admin_module_permissions_role_check
  check (role in ('sales_agent', 'manager', 'support_agent', 'purchase_agent', 'owner'));

alter table public.admin_module_permissions
  drop constraint if exists admin_module_permissions_odoo_link_status_check;

alter table public.admin_module_permissions
  add constraint admin_module_permissions_odoo_link_status_check
  check (odoo_link_status in ('unlinked', 'linked', 'ambiguous', 'not_found', 'manual'));

update public.admin_module_permissions
set role = case when user_type = 'owner' then 'owner' else 'manager' end,
    is_active = true
where role is null or role not in ('sales_agent', 'manager', 'support_agent', 'purchase_agent', 'owner');

alter table public.admin_module_permission_items
  add column if not exists actions jsonb not null default '{"view": true, "create": false, "edit": false, "delete": false, "export": false}'::jsonb;

alter table public.admin_module_permission_items
  drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
  add constraint admin_module_permission_items_module_key_check
  check (module_key in ('supports', 'inventory', 'policies', 'reports', 'purchases', 'calculator', 'meeting_room', 'quoting'));

alter table public.admin_module_permissions
  add column if not exists can_access_purchases boolean not null default false;

insert into public.admin_module_permission_items (
  permission_id,
  user_id,
  module_key,
  can_access,
  visibility_scope
)
select
  permissions.id,
  permissions.user_id,
  'purchases',
  permissions.can_access_purchases,
  'all'
from public.admin_module_permissions permissions
on conflict (user_id, module_key) do nothing;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  company_id bigint,
  session_info jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_target_user_idx
on public.admin_audit_log (target_user_id, created_at desc);

create or replace function private.is_tectronic_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.role = 'owner'
      and permissions.is_active
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  );
$$;

create or replace function public.protect_last_active_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner'
     and old.is_active
     and (new.role <> 'owner' or not new.is_active)
     and not exists (
       select 1
       from public.admin_module_permissions other_owner
       where other_owner.user_id <> old.user_id
         and other_owner.role = 'owner'
         and other_owner.is_active
     ) then
    raise exception 'No se puede desactivar ni degradar al ultimo Propietario activo.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_active_owner_trigger on public.admin_module_permissions;
create trigger protect_last_active_owner_trigger
before update on public.admin_module_permissions
for each row
execute function public.protect_last_active_owner();

alter table public.admin_audit_log enable row level security;

drop policy if exists "owners can read audit log" on public.admin_audit_log;
create policy "owners can read audit log"
on public.admin_audit_log
for select
to authenticated
using ((select private.is_tectronic_owner()));

revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

notify pgrst, 'reload schema';
