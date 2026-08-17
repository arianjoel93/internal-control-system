alter table public.admin_module_permissions
add column if not exists user_type text not null default 'user'
check (user_type in ('owner', 'user'));

update public.admin_module_permissions
set user_type = 'owner',
    can_access_supports = true,
    can_access_inventory = true,
    can_access_policies = true,
    updated_at = now()
where lower(email) = any (
  array[
    'joetectronic@gmail.com',
    'joeltrincadov@gmail.com',
    'joel@tectronic.mx',
    'andrestectronic@gmail.com'
  ]
);

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
    where permissions.user_id = auth.uid()
      and permissions.user_type = 'owner'
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  );
$$;

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
    can_access_policies
  )
  values (
    new.id,
    new.email,
    case when is_owner then 'owner' else 'user' end,
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
      updated_at = now()
  returning id into target_permission_id;

  insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
  select target_permission_id, new.id, module_key, is_owner, 'all'
  from (values ('supports'), ('inventory'), ('policies')) as modules(module_key)
  on conflict (user_id, module_key) do update
  set permission_id = excluded.permission_id,
      can_access = case when is_owner then true else public.admin_module_permission_items.can_access end,
      visibility_scope = case when is_owner then 'all' else public.admin_module_permission_items.visibility_scope end,
      updated_at = now();

  return new;
end;
$$;

update public.admin_module_permission_items items
set can_access = true,
    visibility_scope = 'all',
    updated_at = now()
from public.admin_module_permissions permissions
where permissions.user_id = items.user_id
  and permissions.user_type = 'owner';

notify pgrst, 'reload schema';
