alter table public.admin_module_permissions
  drop constraint if exists admin_module_permissions_role_check;

alter table public.admin_module_permissions
  add constraint admin_module_permissions_role_check
  check (role in ('sales_agent', 'manager', 'marketing_agent', 'support_agent', 'purchase_agent', 'owner'));

update public.admin_module_permissions
set can_access_marketing = true,
    updated_at = now()
where role = 'marketing_agent';

update public.admin_module_permission_items items
set can_access = true,
    visibility_scope = 'all',
    actions = jsonb_set(
      coalesce(items.actions, '{}'::jsonb),
      '{view}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
from public.admin_module_permissions permissions
where items.user_id = permissions.user_id
  and items.module_key = 'marketing'
  and permissions.role = 'marketing_agent';

notify pgrst, 'reload schema';
