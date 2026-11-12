create or replace function public.get_odoo_readonly_connection()
returns table (
  secret_name text,
  secret_value text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Insufficient privilege'
      using errcode = '42501';
  end if;

  return query
  select
    decrypted.name::text,
    decrypted.decrypted_secret::text
  from vault.decrypted_secrets as decrypted
  where decrypted.name in (
    'odoo_reports_url',
    'odoo_reports_database',
    'odoo_reports_user',
    'odoo_reports_api_key'
  );
end;
$$;

revoke all on function public.get_odoo_readonly_connection() from public;
revoke all on function public.get_odoo_readonly_connection() from anon;
revoke all on function public.get_odoo_readonly_connection() from authenticated;
grant execute on function public.get_odoo_readonly_connection() to service_role;
