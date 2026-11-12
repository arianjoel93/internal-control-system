create or replace function app_private.delete_support_event(
  p_support_event_id uuid
)
returns table (
  support_case_id uuid,
  removed_repair_request boolean
)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_support_case_id uuid;
  v_deleted_event_type public.support_event_type;
  v_deleted_event_date timestamptz;
  v_removed_repair_request boolean := false;
  v_latest_event_type public.support_event_type;
  v_latest_event_code text;
  v_next_status public.support_case_status := 'open';
begin
  select
    se.support_case_id,
    se.event_type,
    se.event_date,
    (
      se.event_type = 'diagnosis'::public.support_event_type
      and sc.repair_approval_requested_at = se.event_date
    )
  into
    v_support_case_id,
    v_deleted_event_type,
    v_deleted_event_date,
    v_removed_repair_request
  from public.support_events se
  join public.support_cases sc
    on sc.id = se.support_case_id
  where se.id = p_support_event_id;

  if not found then
    raise exception 'No se encontró el movimiento de soporte.';
  end if;

  delete from public.support_events
  where id = p_support_event_id;

  select
    se.event_type,
    setype.code
  into
    v_latest_event_type,
    v_latest_event_code
  from public.support_events se
  left join public.support_event_types setype
    on setype.id = se.support_event_type_id
  where se.support_case_id = v_support_case_id
  order by se.event_date desc, se.created_at desc, se.id desc
  limit 1;

  v_next_status := case
    when v_latest_event_type is null then 'open'::public.support_case_status
    when v_latest_event_type = 'closed'::public.support_event_type
      or v_latest_event_code in ('equipo_entregado', 'enviada')
      then 'closed'::public.support_case_status
    when v_latest_event_code in ('equipo_recibido', 'preparando_propuesta')
      then 'open'::public.support_case_status
    else 'pending'::public.support_case_status
  end;

  update public.support_cases
  set
    status = v_next_status,
    repair_required = case when v_removed_repair_request then false else repair_required end,
    repair_request_note = case when v_removed_repair_request then null else repair_request_note end,
    repair_approval_status = case when v_removed_repair_request then null else repair_approval_status end,
    repair_approval_requested_at = case when v_removed_repair_request then null else repair_approval_requested_at end,
    repair_approval_deadline = case when v_removed_repair_request then null else repair_approval_deadline end,
    repair_decided_at = case when v_removed_repair_request then null else repair_decided_at end,
    repair_approval_response_source = case when v_removed_repair_request then null else repair_approval_response_source end,
    repair_approval_pin = case when v_removed_repair_request then null else repair_approval_pin end,
    repair_quote_pdf_path = case when v_removed_repair_request then null else repair_quote_pdf_path end,
    repair_quote_pdf_name = case when v_removed_repair_request then null else repair_quote_pdf_name end
  where id = v_support_case_id;

  return query
  select v_support_case_id, v_removed_repair_request;
end;
$$;

create or replace function public.delete_support_event(
  p_support_event_id uuid
)
returns table (
  support_case_id uuid,
  removed_repair_request boolean
)
language sql
security invoker
set search_path = public
as $$
  select *
  from app_private.delete_support_event(p_support_event_id);
$$;

grant execute
on function app_private.delete_support_event(uuid)
to authenticated;

grant execute
on function public.delete_support_event(uuid)
to authenticated;
