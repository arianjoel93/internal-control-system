alter table public.support_cases
add column if not exists repair_approval_pin text,
add column if not exists repair_quote_pdf_path text,
add column if not exists repair_quote_pdf_name text;

alter table public.support_cases
drop constraint if exists support_cases_repair_approval_pin_check;

alter table public.support_cases
add constraint support_cases_repair_approval_pin_check
check (
  repair_approval_pin is null
  or repair_approval_pin ~ '^[0-9]{6}$'
);

update public.support_cases
set repair_approval_pin = lpad(floor(random() * 1000000)::text, 6, '0')
where repair_approval_status = 'pending'
  and repair_approval_pin is null;

revoke update (repair_approval_status, repair_decided_at)
on public.support_cases
from anon;

drop policy if exists "public can answer repair approval"
on public.support_cases;

create schema if not exists app_private;

create or replace function app_private.respond_to_repair_approval(
  p_support_case_id uuid,
  p_pin text,
  p_decision text
)
returns table (
  id uuid,
  repair_approval_status text,
  repair_decided_at timestamptz
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
    repair_decided_at = now()
  where support_cases.id = p_support_case_id
    and support_cases.repair_approval_status = 'pending'
    and support_cases.repair_approval_pin = trim(coalesce(p_pin, ''))
  returning
    support_cases.id,
    support_cases.repair_approval_status,
    support_cases.repair_decided_at;

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
  repair_decided_at timestamptz
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

grant usage
on schema app_private
to anon, authenticated;

grant execute
on function app_private.respond_to_repair_approval(uuid, text, text)
to anon, authenticated;

grant execute
on function public.respond_to_repair_approval(uuid, text, text)
to anon, authenticated;
