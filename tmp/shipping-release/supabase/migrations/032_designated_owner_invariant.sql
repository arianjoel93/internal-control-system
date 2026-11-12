-- The designated account is an invariant, not a UI convention.
create or replace function private.enforce_owner_permission_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'joeltrincadov@gmail.com' then
    if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = 'joeltrincadov@gmail.com'
       and lower(coalesce(new.email, '')) <> lower(coalesce(old.email, '')) then
      raise exception 'El correo del Propietario principal no puede cambiarse.';
    end if;
    new.role := 'owner';
    new.user_type := 'owner';
    new.is_active := true;
  end if;

  if new.role = 'owner' then
    new.user_type := 'owner';
    new.can_access_supports := true;
    new.can_access_inventory := true;
    new.can_access_policies := true;
    new.can_access_reports := true;
    new.can_access_purchases := true;
    new.can_access_quoting := true;
    new.can_access_calculator := true;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_owner_permission_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = new.user_id
      and permissions.role = 'owner'
      and permissions.is_active
  ) then
    new.can_access := true;
    new.visibility_scope := 'all';
    new.actions := '{"view": true, "create": true, "edit": true, "delete": true, "export": true}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owner_permission_summary_trigger on public.admin_module_permissions;
create trigger enforce_owner_permission_summary_trigger
before insert or update on public.admin_module_permissions
for each row
execute function private.enforce_owner_permission_summary();

drop trigger if exists enforce_owner_permission_item_trigger on public.admin_module_permission_items;
create trigger enforce_owner_permission_item_trigger
before insert or update on public.admin_module_permission_items
for each row
execute function private.enforce_owner_permission_item();

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
where lower(email) = 'joeltrincadov@gmail.com';

update public.admin_module_permission_items items
set can_access = true,
    visibility_scope = 'all',
    actions = '{"view": true, "create": true, "edit": true, "delete": true, "export": true}'::jsonb,
    updated_at = now()
from public.admin_module_permissions permissions
where permissions.user_id = items.user_id
  and permissions.role = 'owner'
  and permissions.is_active;

revoke execute on function private.enforce_owner_permission_summary() from public, anon, authenticated;
revoke execute on function private.enforce_owner_permission_item() from public, anon, authenticated;
notify pgrst, 'reload schema';
