-- Keep the designated owner recognized by RLS even during a permissions refresh.
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
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'joeltrincadov@gmail.com';
$$;

revoke execute on function private.is_tectronic_owner() from public, anon, authenticated;
notify pgrst, 'reload schema';
