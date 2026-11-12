create or replace function public.claim_report_odoo_sync(
  p_source_database text,
  p_sync_key text,
  p_model_name text,
  p_lock_owner text,
  p_stale_after interval default interval '15 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer := 0;
begin
  update public.report_odoo_sync_state
    set status = 'running',
        lock_owner = p_lock_owner,
        locked_at = now(),
        last_sync_at = now(),
        updated_at = now(),
        error_message = null
  where source_database = p_source_database
    and sync_key = p_sync_key
    and model_name = p_model_name
    and (
      status <> 'running'
      or locked_at is null
      or locked_at < now() - p_stale_after
    );

  get diagnostics v_row_count = row_count;
  if v_row_count > 0 then
    return true;
  end if;

  begin
    insert into public.report_odoo_sync_state (
      source_database,
      sync_key,
      model_name,
      status,
      lock_owner,
      locked_at,
      last_sync_at,
      updated_at
    ) values (
      p_source_database,
      p_sync_key,
      p_model_name,
      'running',
      p_lock_owner,
      now(),
      now(),
      now()
    );
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

revoke all on function public.claim_report_odoo_sync(text, text, text, text, interval) from public;
grant execute on function public.claim_report_odoo_sync(text, text, text, text, interval) to service_role;
