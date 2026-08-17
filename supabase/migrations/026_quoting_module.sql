alter table public.admin_module_permissions
  add column if not exists can_access_quoting boolean not null default false;

update public.admin_module_permissions
set can_access_quoting = true
where user_type = 'owner'
   or lower(email) in (
     'joetectronic@gmail.com',
     'joeltrincadov@gmail.com',
     'joel@tectronic.mx',
     'andrestectronic@gmail.com'
   );

alter table public.admin_module_permission_items
  drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
  add constraint admin_module_permission_items_module_key_check
  check (module_key in ('supports', 'inventory', 'policies', 'reports', 'calculator', 'meeting_room', 'quoting'));

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
  'quoting',
  permissions.can_access_quoting,
  'all'
from public.admin_module_permissions as permissions
on conflict (user_id, module_key) do nothing;

create table if not exists public.shipping_quote_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'fedex' check (provider = 'fedex'),
  fedex_base_url text not null default 'https://apis.fedex.com',
  fedex_origin_postal_code text,
  fedex_client_id text,
  fedex_client_secret text,
  fedex_account_number text,
  fedex_child_key text,
  fedex_child_secret text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

insert into public.shipping_quote_settings (
  provider
)
values ('fedex')
on conflict (provider) do nothing;

drop trigger if exists shipping_quote_settings_set_updated_at on public.shipping_quote_settings;
create trigger shipping_quote_settings_set_updated_at
before update on public.shipping_quote_settings
for each row
execute function public.set_updated_at();

alter table public.shipping_quote_settings enable row level security;

drop policy if exists "owners can read shipping quote settings" on public.shipping_quote_settings;
create policy "owners can read shipping quote settings"
on public.shipping_quote_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

drop policy if exists "owners can insert shipping quote settings" on public.shipping_quote_settings;
create policy "owners can insert shipping quote settings"
on public.shipping_quote_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

drop policy if exists "owners can update shipping quote settings" on public.shipping_quote_settings;
create policy "owners can update shipping quote settings"
on public.shipping_quote_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and (
        permissions.user_type = 'owner'
        or lower(permissions.email) in (
          'joetectronic@gmail.com',
          'joeltrincadov@gmail.com',
          'joel@tectronic.mx',
          'andrestectronic@gmail.com'
        )
      )
  )
);

grant select, insert, update on public.shipping_quote_settings to authenticated;

notify pgrst, 'reload schema';
