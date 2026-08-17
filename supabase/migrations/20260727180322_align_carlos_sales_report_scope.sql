with target_user as (
  select id
  from auth.users
  where lower(trim(email)) = 'carlos@tectronic.mx'
)
update public.admin_module_permissions permissions
set role = 'sales_agent',
    odoo_user_id = null,
    odoo_partner_id = null,
    odoo_salesperson_id = null,
    odoo_email = null,
    odoo_link_status = 'unlinked',
    odoo_linked_at = null
where permissions.user_id in (select id from target_user)
  and permissions.user_type <> 'owner';

with target_user as (
  select id
  from auth.users
  where lower(trim(email)) = 'carlos@tectronic.mx'
)
update public.admin_module_permission_items permission_item
set visibility_scope = 'own'
where permission_item.user_id in (select id from target_user)
  and permission_item.module_key = 'reports'
  and permission_item.can_access = true;
