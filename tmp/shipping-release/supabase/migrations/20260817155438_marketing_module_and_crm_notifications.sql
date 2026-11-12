alter table public.admin_module_permissions
  add column if not exists can_access_marketing boolean not null default false;

alter table public.admin_module_permission_items
  drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
  add constraint admin_module_permission_items_module_key_check
  check (module_key in ('supports', 'inventory', 'policies', 'reports', 'purchases', 'marketing', 'calculator', 'meeting_room', 'quoting'));

update public.admin_module_permissions
set can_access_marketing = true
where role = 'owner'
   or user_type = 'owner'
   or lower(email) = 'joeltrincadov@gmail.com';

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
    new.can_access_marketing := true;
    new.can_access_quoting := true;
    new.can_access_calculator := true;
  end if;

  return new;
end;
$$;

insert into public.admin_module_permission_items (
  permission_id,
  user_id,
  module_key,
  can_access,
  visibility_scope,
  actions
)
select
  permissions.id,
  permissions.user_id,
  'marketing',
  permissions.can_access_marketing,
  'all',
  jsonb_build_object(
    'view', permissions.can_access_marketing,
    'create', false,
    'edit', false,
    'delete', false,
    'export', false
  )
from public.admin_module_permissions permissions
on conflict (user_id, module_key) do nothing;

alter table public.sales_agent_notifications
  drop constraint if exists sales_agent_notifications_category_check;

alter table public.sales_agent_notifications
  add constraint sales_agent_notifications_category_check
  check (
    category in (
      'inactive_client',
      'declining_client',
      'low_conversion',
      'new_customer_gap',
      'expired_quotes',
      'crm_lead',
      'sales_decline',
      'portfolio_concentration'
    )
  );

alter table public.sales_agent_notifications
  drop constraint if exists sales_agent_notifications_entity_type_check;

alter table public.sales_agent_notifications
  add constraint sales_agent_notifications_entity_type_check
  check (entity_type in ('client', 'crm_lead', 'portfolio', 'quotation'));

notify pgrst, 'reload schema';
