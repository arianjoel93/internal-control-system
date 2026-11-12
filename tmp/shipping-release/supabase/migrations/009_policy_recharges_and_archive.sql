alter table public.policy_clients
  add column if not exists additional_hours numeric(10, 2) not null default 0 check (additional_hours >= 0),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_until timestamptz;

create index if not exists policy_clients_archived_until_idx
on public.policy_clients (archived_until)
where is_active = false;

create or replace function public.calculate_policy_service_hours()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  total_hours numeric(10, 2);
  consumed_hours numeric(10, 2);
begin
  if new.client_id is null then
    raise exception 'Selecciona un cliente para registrar la póliza.';
  end if;

  if new.end_at <= new.start_at then
    raise exception 'La hora de fin no puede ser menor o igual que la hora de inicio.';
  end if;

  new.duration_hours := round((extract(epoch from (new.end_at - new.start_at)) / 3600.0)::numeric, 2);

  if new.duration_hours <= 0 then
    raise exception 'La duración del servicio debe ser mayor a cero.';
  end if;

  select policy_hours + additional_hours into total_hours
  from public.policy_clients
  where id = new.client_id and is_active = true
  for update;

  if total_hours is null then
    raise exception 'El cliente no existe o está archivado.';
  end if;

  select coalesce(sum(duration_hours), 0) into consumed_hours
  from public.policy_services
  where client_id = new.client_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if consumed_hours >= total_hours then
    raise exception 'La póliza del cliente está agotada.';
  end if;

  if consumed_hours + new.duration_hours > total_hours then
    raise exception 'El servicio excede las horas restantes de la póliza.';
  end if;

  return new;
end;
$$;
