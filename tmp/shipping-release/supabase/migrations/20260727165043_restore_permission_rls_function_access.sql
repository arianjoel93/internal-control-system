-- This function is evaluated by permission-table RLS policies. Authenticated
-- users need EXECUTE to read their own row; the policies still restrict rows.
revoke execute on function private.is_tectronic_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_tectronic_owner() to authenticated;

drop policy if exists "owners can read all module permissions" on public.admin_module_permissions;
create policy "owners can read all module permissions"
on public.admin_module_permissions
for select
to authenticated
using (
  (select private.is_tectronic_owner())
  or user_id = (select auth.uid())
  or (
    (select auth.uid()) is not null
    and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

notify pgrst, 'reload schema';
