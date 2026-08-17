alter table public.support_cases
add column if not exists repair_approval_response_source text;

alter table public.support_cases
drop constraint if exists support_cases_repair_approval_response_source_check;

alter table public.support_cases
add constraint support_cases_repair_approval_response_source_check
check (
  repair_approval_response_source is null
  or repair_approval_response_source in ('customer', 'automatic')
);

update public.support_cases
set repair_approval_response_source = case
  when repair_approval_status = 'accepted' then 'customer'
  when repair_approval_status = 'declined'
    and repair_approval_deadline is not null
    and repair_decided_at is not null
    and repair_decided_at >= repair_approval_deadline then 'automatic'
  when repair_approval_status = 'declined' then 'customer'
  else null
end
where repair_approval_response_source is null;

create or replace function app_private.move_declined_repairs_to_ready()
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  ready_event_type_id uuid;
begin
  select id into ready_event_type_id
  from public.support_event_types
  where code = 'equipo_listo_entrega'
  limit 1;

  insert into public.support_events (
    support_case_id,
    event_type,
    support_event_type_id,
    title,
    event_date,
    ticket_reference
  )
  select
    sc.id,
    'note'::public.support_event_type,
    ready_event_type_id,
    'Equipo listo para entrega',
    now(),
    sc.folio
  from public.support_cases sc
  where sc.support_type = 'technical'
    and sc.repair_required = true
    and sc.repair_approval_status in ('pending', 'declined')
    and sc.repair_approval_deadline <= now()
    and ready_event_type_id is not null
    and not exists (
      select 1
      from public.support_events se
      where se.support_case_id = sc.id
        and se.support_event_type_id = ready_event_type_id
        and se.event_date >= coalesce(sc.repair_approval_requested_at, sc.created_at)
    );

  update public.support_cases
  set
    status = 'pending',
    repair_approval_status = 'declined',
    repair_decided_at = coalesce(repair_decided_at, now()),
    repair_approval_response_source = coalesce(repair_approval_response_source, 'automatic')
  where support_type = 'technical'
    and repair_required = true
    and repair_approval_status in ('pending', 'declined')
    and repair_approval_deadline <= now();
end;
$$;

drop function if exists public.respond_to_repair_approval(uuid, text, text);
drop function if exists app_private.respond_to_repair_approval(uuid, text, text);

create or replace function app_private.respond_to_repair_approval(
  p_support_case_id uuid,
  p_pin text,
  p_decision text
)
returns table (
  id uuid,
  repair_approval_status text,
  repair_decided_at timestamptz,
  repair_approval_response_source text
)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if p_decision not in ('accepted', 'declined') then
    raise exception 'La respuesta de autorizacion no es valida.';
  end if;

  return query
  update public.support_cases
  set
    repair_approval_status = p_decision,
    repair_decided_at = now(),
    repair_approval_response_source = 'customer'
  where support_cases.id = p_support_case_id
    and support_cases.repair_approval_status = 'pending'
    and support_cases.repair_approval_pin = trim(coalesce(p_pin, ''))
  returning
    support_cases.id,
    support_cases.repair_approval_status,
    support_cases.repair_decided_at,
    support_cases.repair_approval_response_source;

  if not found then
    raise exception 'El PIN es incorrecto o la solicitud ya no esta disponible.';
  end if;
end;
$$;

create or replace function public.respond_to_repair_approval(
  p_support_case_id uuid,
  p_pin text,
  p_decision text
)
returns table (
  id uuid,
  repair_approval_status text,
  repair_decided_at timestamptz,
  repair_approval_response_source text
)
language sql
security invoker
set search_path = public
as $$
  select *
  from app_private.respond_to_repair_approval(
    p_support_case_id,
    p_pin,
    p_decision
  );
$$;
