alter table public.support_cases
add column if not exists created_by uuid references auth.users(id) on delete set null,
add column if not exists created_by_email text;

alter table public.inventory_products
add column if not exists created_by uuid references auth.users(id) on delete set null,
add column if not exists created_by_email text;

alter table public.inventory_warehouses
add column if not exists created_by uuid references auth.users(id) on delete set null,
add column if not exists created_by_email text;

create table if not exists public.admin_module_permission_items (
  id uuid primary key default gen_random_uuid(),
  permission_id uuid not null references public.admin_module_permissions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in ('supports', 'inventory', 'policies')),
  can_access boolean not null default false,
  visibility_scope text not null default 'all' check (visibility_scope in ('all', 'own')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key)
);

create index if not exists admin_module_permission_items_permission_idx
on public.admin_module_permission_items (permission_id);

create index if not exists admin_module_permission_items_user_module_idx
on public.admin_module_permission_items (user_id, module_key);

drop trigger if exists admin_module_permission_items_set_updated_at on public.admin_module_permission_items;
create trigger admin_module_permission_items_set_updated_at
before update on public.admin_module_permission_items
for each row
execute function public.set_updated_at();

insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
select permission.id, permission.user_id, module.module_key, module.can_access, 'all'
from public.admin_module_permissions permission
cross join lateral (
  values
    ('supports', permission.can_access_supports),
    ('inventory', permission.can_access_inventory),
    ('policies', permission.can_access_policies)
) as module(module_key, can_access)
on conflict (user_id, module_key) do update
set permission_id = excluded.permission_id,
    can_access = excluded.can_access,
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
    can_access_supports,
    can_access_inventory,
    can_access_policies
  )
  values (
    new.id,
    new.email,
    is_owner,
    is_owner,
    is_owner
  )
  on conflict (user_id) do update
  set email = excluded.email,
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
      updated_at = now();

  return new;
end;
$$;

alter table public.admin_module_permission_items enable row level security;

drop policy if exists "owners can read all module permission items" on public.admin_module_permission_items;
create policy "owners can read all module permission items"
on public.admin_module_permission_items
for select
to authenticated
using ((select private.is_tectronic_owner()) or user_id = (select auth.uid()));

drop policy if exists "owners can insert module permission items" on public.admin_module_permission_items;
create policy "owners can insert module permission items"
on public.admin_module_permission_items
for insert
to authenticated
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can update module permission items" on public.admin_module_permission_items;
create policy "owners can update module permission items"
on public.admin_module_permission_items
for update
to authenticated
using ((select private.is_tectronic_owner()))
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can delete module permission items" on public.admin_module_permission_items;
create policy "owners can delete module permission items"
on public.admin_module_permission_items
for delete
to authenticated
using ((select private.is_tectronic_owner()));

grant select, insert, update, delete on public.admin_module_permission_items to authenticated;

create index if not exists support_cases_created_by_idx
on public.support_cases (created_by, created_at desc);

create index if not exists inventory_products_created_by_idx
on public.inventory_products (created_by, is_active, name);

create index if not exists inventory_warehouses_created_by_idx
on public.inventory_warehouses (created_by, is_active, name);

notify pgrst, 'reload schema';
