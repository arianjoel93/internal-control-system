drop policy if exists "module users can insert meeting room events" on public.meeting_room_events;
create policy "module users can insert meeting room events"
on public.meeting_room_events
for insert
to authenticated
with check (
  (select private.can_access_admin_module('meeting_room'))
  and (created_by = (select auth.uid()) or (select private.is_tectronic_owner()))
);

notify pgrst, 'reload schema';
