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
    new.can_access_marketing := true;
    new.can_access_forms := true;
    new.can_access_shipping_quotes := true;
  end if;

  new.can_access_purchases := false;
  new.can_access_quoting := false;
  new.can_access_calculator := false;
  return new;
end;
$$;

create or replace function private.suppress_retired_module_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.module_key in ('purchases', 'quoting', 'calculator') then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists suppress_retired_module_permissions_trigger on public.admin_module_permission_items;
create trigger suppress_retired_module_permissions_trigger
before insert or update on public.admin_module_permission_items
for each row execute function private.suppress_retired_module_permissions();

revoke execute on function private.suppress_retired_module_permissions() from public, anon, authenticated;

update public.admin_module_permissions
set can_access_purchases = false,
    can_access_quoting = false,
    can_access_calculator = false
where can_access_purchases or can_access_quoting or can_access_calculator;

delete from public.admin_module_permission_items
where module_key in ('purchases', 'quoting', 'calculator');

notify pgrst, 'reload schema';
