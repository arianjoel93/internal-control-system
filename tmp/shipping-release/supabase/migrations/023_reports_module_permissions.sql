alter table public.admin_module_permissions
  add column if not exists can_access_reports boolean not null default false;

update public.admin_module_permissions
set can_access_reports = true
where user_type = 'owner'
   or lower(email) in (
     'joetectronic@gmail.com',
     'joeltrincadov@gmail.com',
     'joel@tectronic.mx',
     'andrestectronic@gmail.com'
   );

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
  'reports',
  permissions.can_access_reports,
  'all'
from public.admin_module_permissions as permissions
on conflict (user_id, module_key) do nothing;
