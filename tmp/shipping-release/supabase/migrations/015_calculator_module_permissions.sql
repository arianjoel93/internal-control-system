alter table public.admin_module_permissions
add column if not exists can_access_calculator boolean not null default false;

alter table public.admin_module_permission_items
drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
add constraint admin_module_permission_items_module_key_check
check (module_key in ('supports', 'inventory', 'policies', 'calculator'));

update public.admin_module_permissions
set can_access_calculator = true,
    updated_at = now()
where user_type = 'owner';

insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
select
  permission.id,
  permission.user_id,
  'calculator',
  permission.user_type = 'owner',
  'all'
from public.admin_module_permissions permission
on conflict (user_id, module_key) do update
set permission_id = excluded.permission_id,
    can_access = case
      when excluded.can_access then true
      else public.admin_module_permission_items.can_access
    end,
    visibility_scope = case
      when excluded.can_access then 'all'
      else public.admin_module_permission_items.visibility_scope
    end,
    updated_at = now();

create or replace function public.sync_admin_module_permission_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_permission_id uuid;
  is_owner boolean;
begin
  is_owner := lower(coalesce(new.email, '')) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  );

  insert into public.admin_module_permissions (
    user_id,
    email,
    user_type,
    can_access_supports,
    can_access_inventory,
    can_access_policies,
    can_access_calculator
  )
  values (
    new.id,
    new.email,
    case when is_owner then 'owner' else 'user' end,
    is_owner,
    is_owner,
    is_owner,
    is_owner
  )
  on conflict (user_id) do update
  set email = excluded.email,
      user_type = case when is_owner then 'owner' else public.admin_module_permissions.user_type end,
      can_access_supports = case when is_owner then true else public.admin_module_permissions.can_access_supports end,
      can_access_inventory = case when is_owner then true else public.admin_module_permissions.can_access_inventory end,
      can_access_policies = case when is_owner then true else public.admin_module_permissions.can_access_policies end,
      can_access_calculator = case when is_owner then true else public.admin_module_permissions.can_access_calculator end,
      updated_at = now()
  returning id into target_permission_id;

  insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
  select target_permission_id, new.id, module_key, is_owner, 'all'
  from (values ('supports'), ('inventory'), ('policies'), ('calculator')) as modules(module_key)
  on conflict (user_id, module_key) do update
  set permission_id = excluded.permission_id,
      can_access = case when is_owner then true else public.admin_module_permission_items.can_access end,
      visibility_scope = case when is_owner then 'all' else public.admin_module_permission_items.visibility_scope end,
      updated_at = now();

  return new;
end;
$$;

notify pgrst, 'reload schema';
