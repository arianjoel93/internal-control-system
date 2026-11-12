create table if not exists public.meeting_room_settings (
  id boolean primary key default true,
  available_weekdays integer[] not null default array[1, 2, 3, 4, 5],
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  constraint meeting_room_settings_singleton_check check (id),
  constraint meeting_room_settings_time_check check (end_time > start_time)
);

insert into public.meeting_room_settings (id, available_weekdays, start_time, end_time)
values (true, array[1, 2, 3, 4, 5], '09:00', '18:00')
on conflict (id) do nothing;

drop trigger if exists meeting_room_settings_set_updated_at on public.meeting_room_settings;
create trigger meeting_room_settings_set_updated_at
before update on public.meeting_room_settings
for each row
execute function public.set_updated_at();

alter table public.meeting_room_settings enable row level security;

drop policy if exists "module users can read meeting room settings" on public.meeting_room_settings;
create policy "module users can read meeting room settings"
on public.meeting_room_settings
for select
to authenticated
using ((select private.can_access_admin_module('meeting_room')));

drop policy if exists "owners can insert meeting room settings" on public.meeting_room_settings;
create policy "owners can insert meeting room settings"
on public.meeting_room_settings
for insert
to authenticated
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can update meeting room settings" on public.meeting_room_settings;
create policy "owners can update meeting room settings"
on public.meeting_room_settings
for update
to authenticated
using ((select private.is_tectronic_owner()))
with check ((select private.is_tectronic_owner()));

drop policy if exists "owners can delete meeting room settings" on public.meeting_room_settings;
create policy "owners can delete meeting room settings"
on public.meeting_room_settings
for delete
to authenticated
using ((select private.is_tectronic_owner()));

drop policy if exists "module users can update meeting room events" on public.meeting_room_events;
create policy "module users can update meeting room events"
on public.meeting_room_events
for update
to authenticated
using (
  (select private.can_access_admin_module('meeting_room'))
  and (created_by = (select auth.uid()) or (select private.is_tectronic_owner()))
)
with check (
  (select private.can_access_admin_module('meeting_room'))
  and (created_by = (select auth.uid()) or (select private.is_tectronic_owner()))
);

drop policy if exists "module users can delete meeting room events" on public.meeting_room_events;
create policy "module users can delete meeting room events"
on public.meeting_room_events
for delete
to authenticated
using (
  (select private.can_access_admin_module('meeting_room'))
  and (created_by = (select auth.uid()) or (select private.is_tectronic_owner()))
);

grant select, insert, update, delete on public.meeting_room_settings to authenticated;

notify pgrst, 'reload schema';
