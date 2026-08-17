alter table public.admin_module_permissions
  add column if not exists can_access_reports boolean not null default false;

update public.admin_module_permissions
set role = 'owner',
    user_type = 'owner',
    is_active = true,
    can_access_supports = true,
    can_access_inventory = true,
    can_access_policies = true,
    can_access_reports = true,
    can_access_purchases = true,
    can_access_quoting = true,
    can_access_calculator = true
where lower(email) in (
  'joetectronic@gmail.com',
  'joeltrincadov@gmail.com',
  'andrestectronic@gmail.com'
);

update public.admin_module_permission_items items
set can_access = true,
    visibility_scope = 'all',
    actions = '{"view": true, "create": true, "edit": true, "delete": true, "export": true}'::jsonb,
    updated_at = now()
from public.admin_module_permissions permissions
where permissions.user_id = items.user_id
  and permissions.role = 'owner';

revoke execute on function public.protect_last_active_owner() from public;
revoke execute on function public.sync_admin_module_permission_for_user() from public;

notify pgrst, 'reload schema';
