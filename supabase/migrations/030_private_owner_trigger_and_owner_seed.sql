-- Keep the known existing owner accounts while moving authorization to database state.
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
  'joel@tectronic.mx',
  'andrestectronic@gmail.com'
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
    where permissions.user_id = (select auth.uid())
      and permissions.role = 'owner'
      and permissions.is_active
  );
$$;

create or replace function private.protect_last_active_owner()
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
execute function private.protect_last_active_owner();

drop function if exists public.protect_last_active_owner();
revoke execute on function private.protect_last_active_owner() from public, anon, authenticated;
revoke execute on function private.is_tectronic_owner() from public, anon, authenticated;

notify pgrst, 'reload schema';
