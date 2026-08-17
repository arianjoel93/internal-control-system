create schema if not exists private;

create table if not exists public.admin_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  can_access_supports boolean not null default false,
  can_access_inventory boolean not null default false,
  can_access_policies boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_module_permissions_email_idx
on public.admin_module_permissions (lower(email));

create or replace function private.is_tectronic_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
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
begin
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
    false,
    false,
    false
  )
  on conflict (user_id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists auth_users_sync_admin_permissions on auth.users;
create trigger auth_users_sync_admin_permissions
after insert or update of email on auth.users
for each row
execute function public.sync_admin_module_permission_for_user();

insert into public.admin_module_permissions (
  user_id,
  email,
  can_access_supports,
  can_access_inventory,
  can_access_policies
)
select
  users.id,
  users.email,
  lower(users.email) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  ),
  lower(users.email) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  ),
  lower(users.email) = any (
    array[
      'joetectronic@gmail.com',
      'joeltrincadov@gmail.com',
      'joel@tectronic.mx',
      'andrestectronic@gmail.com'
    ]
  )
from auth.users users
where users.email is not null
on conflict (user_id) do update
set email = excluded.email,
    can_access_supports = case
      when lower(excluded.email) = any (
        array[
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        ]
      ) then true
      else public.admin_module_permissions.can_access_supports
    end,
    can_access_inventory = case
      when lower(excluded.email) = any (
        array[
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        ]
      ) then true
      else public.admin_module_permissions.can_access_inventory
    end,
    can_access_policies = case
      when lower(excluded.email) = any (
        array[
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        ]
      ) then true
      else public.admin_module_permissions.can_access_policies
    end,
    updated_at = now();

alter table public.admin_module_permissions enable row level security;

drop policy if exists "owners can read all module permissions" on public.admin_module_permissions;
create policy "owners can read all module permissions"
on public.admin_module_permissions
for select
to authenticated
using ((select private.is_tectronic_owner()) or user_id = (select auth.uid()));

drop policy if exists "owners can insert module permissions" on public.admin_module_permissions;
create policy "owners can insert module permissions"
on public.admin_module_permissions
for insert
to authenticated
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can update module permissions" on public.admin_module_permissions;
create policy "owners can update module permissions"
on public.admin_module_permissions
for update
to authenticated
using ((select private.is_tectronic_owner()))
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can delete module permissions" on public.admin_module_permissions;
create policy "owners can delete module permissions"
on public.admin_module_permissions
for delete
to authenticated
using ((select private.is_tectronic_owner()));

grant usage on schema private to authenticated;
grant execute on function private.is_tectronic_owner() to authenticated;
grant select, insert, update, delete on public.admin_module_permissions to authenticated;
notify pgrst, 'reload schema';
