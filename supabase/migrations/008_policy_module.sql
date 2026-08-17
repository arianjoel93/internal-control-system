create table if not exists public.policy_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  curp text not null,
  business_name text not null,
  address text not null,
  policy_hours integer not null check (policy_hours in (10, 20, 30, 40, 50)),
  rfc text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.policy_clients(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_hours numeric(10, 2) not null default 0 check (duration_hours >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create unique index if not exists policy_clients_curp_active_idx
on public.policy_clients (upper(curp))
where is_active = true;

create index if not exists policy_clients_search_idx
on public.policy_clients using gin (
  (coalesce(full_name, '') || ' ' || coalesce(curp, '') || ' ' || coalesce(business_name, '') || ' ' || coalesce(rfc, '')) gin_trgm_ops
);

create index if not exists policy_clients_active_name_idx
on public.policy_clients (is_active, full_name);

create index if not exists policy_services_client_start_idx
on public.policy_services (client_id, start_at desc);

create index if not exists policy_clients_created_by_idx
on public.policy_clients (created_by);

create index if not exists policy_services_created_by_idx
on public.policy_services (created_by);

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

  select policy_hours into total_hours
  from public.policy_clients
  where id = new.client_id and is_active = true
  for update;

  if total_hours is null then
    raise exception 'El cliente no existe o está inactivo.';
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

drop trigger if exists policy_services_calculate_hours on public.policy_services;
create trigger policy_services_calculate_hours
before insert or update on public.policy_services
for each row
execute function public.calculate_policy_service_hours();

drop trigger if exists policy_clients_set_updated_at on public.policy_clients;
create trigger policy_clients_set_updated_at
before update on public.policy_clients
for each row
execute function public.set_updated_at();

drop trigger if exists policy_services_set_updated_at on public.policy_services;
create trigger policy_services_set_updated_at
before update on public.policy_services
for each row
execute function public.set_updated_at();

alter table public.policy_clients enable row level security;
alter table public.policy_services enable row level security;

drop policy if exists "authenticated can read policy clients" on public.policy_clients;
create policy "authenticated can read policy clients"
on public.policy_clients
for select
to authenticated
using ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated can insert policy clients" on public.policy_clients;
create policy "authenticated can insert policy clients"
on public.policy_clients
for insert
to authenticated
with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated can update policy clients" on public.policy_clients;
create policy "authenticated can update policy clients"
on public.policy_clients
for update
to authenticated
using ((select auth.role()) = 'authenticated')
with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated can read policy services" on public.policy_services;
create policy "authenticated can read policy services"
on public.policy_services
for select
to authenticated
using ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated can insert policy services" on public.policy_services;
create policy "authenticated can insert policy services"
on public.policy_services
for insert
to authenticated
with check ((select auth.role()) = 'authenticated');

drop policy if exists "authenticated can update policy services" on public.policy_services;
create policy "authenticated can update policy services"
on public.policy_services
for update
to authenticated
using ((select auth.role()) = 'authenticated')
with check ((select auth.role()) = 'authenticated');

grant select, insert, update on public.policy_clients to authenticated;
grant select, insert, update on public.policy_services to authenticated;
