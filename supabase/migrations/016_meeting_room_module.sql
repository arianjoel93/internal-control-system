alter table public.admin_module_permissions
add column if not exists can_access_meeting_room boolean not null default false;

alter table public.admin_module_permission_items
drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
add constraint admin_module_permission_items_module_key_check
check (module_key in ('supports', 'inventory', 'policies', 'calculator', 'meeting_room'));

update public.admin_module_permissions
set can_access_meeting_room = true,
    updated_at = now()
where user_type = 'owner';

insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
select
  permission.id,
  permission.user_id,
  'meeting_room',
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
    can_access_calculator,
    can_access_meeting_room
  )
  values (
    new.id,
    new.email,
    case when is_owner then 'owner' else 'user' end,
    is_owner,
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
      can_access_meeting_room = case when is_owner then true else public.admin_module_permissions.can_access_meeting_room end,
      updated_at = now()
  returning id into target_permission_id;

  insert into public.admin_module_permission_items (permission_id, user_id, module_key, can_access, visibility_scope)
  select target_permission_id, new.id, module_key, is_owner, 'all'
  from (values ('supports'), ('inventory'), ('policies'), ('calculator'), ('meeting_room')) as modules(module_key)
  on conflict (user_id, module_key) do update
  set permission_id = excluded.permission_id,
      can_access = case when is_owner then true else public.admin_module_permission_items.can_access end,
      visibility_scope = case when is_owner then 'all' else public.admin_module_permission_items.visibility_scope end,
      updated_at = now();

  return new;
end;
$$;

create or replace function private.can_access_admin_module(target_module_key text)
returns boolean
language sql
security definer
set search_path = public, private, auth
as $$
  select coalesce((
    select true
    from public.admin_module_permissions permission
    left join public.admin_module_permission_items item
      on item.permission_id = permission.id
     and item.module_key = target_module_key
    where permission.user_id = auth.uid()
      and (
        permission.user_type = 'owner'
        or coalesce(
          item.can_access,
          case target_module_key
            when 'supports' then permission.can_access_supports
            when 'inventory' then permission.can_access_inventory
            when 'policies' then permission.can_access_policies
            when 'calculator' then permission.can_access_calculator
            when 'meeting_room' then permission.can_access_meeting_room
            else false
          end
        )
      )
    limit 1
  ), false);
$$;

create table if not exists public.meeting_room_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_partner text,
  description text,
  tag text,
  color text not null default '#1178d4',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_room_events_status_check check (status in ('scheduled', 'cancelled')),
  constraint meeting_room_events_time_check check (end_at > start_at)
);

create index if not exists meeting_room_events_time_idx
on public.meeting_room_events (start_at, end_at);

create index if not exists meeting_room_events_created_by_idx
on public.meeting_room_events (created_by);

drop trigger if exists meeting_room_events_set_updated_at on public.meeting_room_events;
create trigger meeting_room_events_set_updated_at
before update on public.meeting_room_events
for each row
execute function public.set_updated_at();

alter table public.meeting_room_events enable row level security;

drop policy if exists "module users can read meeting room events" on public.meeting_room_events;
create policy "module users can read meeting room events"
on public.meeting_room_events
for select
to authenticated
using ((select private.can_access_admin_module('meeting_room')));

drop policy if exists "module users can insert meeting room events" on public.meeting_room_events;
create policy "module users can insert meeting room events"
on public.meeting_room_events
for insert
to authenticated
with check ((select private.can_access_admin_module('meeting_room')));

drop policy if exists "module users can update meeting room events" on public.meeting_room_events;
create policy "module users can update meeting room events"
on public.meeting_room_events
for update
to authenticated
using ((select private.can_access_admin_module('meeting_room')))
with check ((select private.can_access_admin_module('meeting_room')));

drop policy if exists "module users can delete meeting room events" on public.meeting_room_events;
create policy "module users can delete meeting room events"
on public.meeting_room_events
for delete
to authenticated
using ((select private.can_access_admin_module('meeting_room')));

grant execute on function private.can_access_admin_module(text) to authenticated;
grant select, insert, update, delete on public.meeting_room_events to authenticated;

notify pgrst, 'reload schema';
