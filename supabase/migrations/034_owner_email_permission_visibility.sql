drop policy if exists "owners can read all module permissions" on public.admin_module_permissions;
create policy "owners can read all module permissions"
on public.admin_module_permissions
for select
to authenticated
using (
  (select private.is_tectronic_owner())
  or user_id = (select auth.uid())
  or (
    lower(email) = 'joeltrincadov@gmail.com'
    and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
);

notify pgrst, 'reload schema';
