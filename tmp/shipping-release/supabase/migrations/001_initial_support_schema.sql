create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron with schema extensions;

create type public.support_case_status as enum ('open', 'closed', 'pending');
create type public.support_event_type as enum (
  'ticket_created',
  'remote_support_scheduled',
  'diagnosis',
  'repair',
  'closed',
  'note'
);

create table public.support_agents (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  position text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  support_type text not null default 'technical' check (support_type in ('technical', 'programming')),
  support_agent_id uuid references public.support_agents(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  performed_by text not null,
  manufacturer text not null,
  printer_model text not null,
  part_number text,
  serial_number text not null,
  sale_date date,
  warranty_end_date date,
  programming_business_days integer check (programming_business_days is null or programming_business_days > 0),
  status public.support_case_status not null default 'open',
  issue_summary text not null,
  resolution_notes text,
  repair_required boolean not null default false,
  repair_request_note text,
  repair_approval_status text check (repair_approval_status is null or repair_approval_status in ('pending', 'accepted', 'declined')),
  repair_approval_requested_at timestamptz,
  repair_approval_deadline timestamptz,
  repair_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_events (
  id uuid primary key default gen_random_uuid(),
  support_case_id uuid not null references public.support_cases(id) on delete cascade,
  event_type public.support_event_type not null default 'ticket_created',
  support_event_type_id uuid,
  title text not null,
  event_date timestamptz not null default now(),
  ticket_reference text,
  created_at timestamptz not null default now()
);

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.printer_models (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  name text not null,
  part_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, name)
);

create table public.support_event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  event_type public.support_event_type not null default 'note',
  support_type text not null default 'technical' check (support_type in ('technical', 'programming')),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-images', 'support-images', true, 1048576, array['image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.support_images (
  id uuid primary key default gen_random_uuid(),
  support_case_id uuid not null references public.support_cases(id) on delete cascade,
  bucket_id text not null default 'support-images',
  storage_path text not null unique,
  original_name text,
  mime_type text not null default 'image/webp',
  size_bytes integer,
  width integer,
  height integer,
  sort_order integer not null default 0 check (sort_order between 0 and 3),
  created_at timestamptz not null default now()
);

alter table public.support_events
add constraint support_events_support_event_type_id_fkey
foreign key (support_event_type_id) references public.support_event_types(id) on delete set null;

create index support_cases_serial_number_idx on public.support_cases (upper(serial_number));
create index support_cases_folio_idx on public.support_cases (folio);
create index support_cases_customer_name_idx on public.support_cases using gin (customer_name gin_trgm_ops);
create index support_events_case_date_idx on public.support_events (support_case_id, event_date desc);
create index support_agents_active_name_idx on public.support_agents (is_active, full_name);
create index printer_models_manufacturer_idx on public.printer_models (manufacturer_id, is_active, name);
create index support_event_types_active_idx on public.support_event_types (is_active, sort_order, name);
create index support_images_case_idx on public.support_images (support_case_id, sort_order, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_cases_set_updated_at
before update on public.support_cases
for each row
execute function public.set_updated_at();

create trigger support_agents_set_updated_at
before update on public.support_agents
for each row
execute function public.set_updated_at();

create trigger manufacturers_set_updated_at
before update on public.manufacturers
for each row
execute function public.set_updated_at();

create trigger printer_models_set_updated_at
before update on public.printer_models
for each row
execute function public.set_updated_at();

create trigger support_event_types_set_updated_at
before update on public.support_event_types
for each row
execute function public.set_updated_at();

create or replace function public.enforce_support_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.support_images
    where support_case_id = new.support_case_id
  ) >= 4 then
    raise exception 'Cada soporte puede tener como máximo 4 imágenes.';
  end if;

  return new;
end;
$$;

create trigger support_images_limit
before insert on public.support_images
for each row
execute function public.enforce_support_image_limit();

create schema if not exists app_private;

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
    repair_decided_at = coalesce(repair_decided_at, now())
  where support_type = 'technical'
    and repair_required = true
    and repair_approval_status in ('pending', 'declined')
    and repair_approval_deadline <= now();
end;
$$;

alter table public.support_cases enable row level security;
alter table public.support_events enable row level security;
alter table public.support_agents enable row level security;
alter table public.manufacturers enable row level security;
alter table public.printer_models enable row level security;
alter table public.support_event_types enable row level security;
alter table public.support_images enable row level security;

create policy "public can read support cases"
on public.support_cases
for select
to anon, authenticated
using (true);

create policy "public can read support events"
on public.support_events
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.support_cases
    where support_cases.id = support_events.support_case_id
  )
);

create policy "authenticated can insert support cases"
on public.support_cases
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support cases"
on public.support_cases
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete support cases"
on public.support_cases
for delete
to authenticated
using (auth.role() = 'authenticated');

grant update (repair_approval_status, repair_decided_at)
on public.support_cases
to anon;

create policy "public can answer repair approval"
on public.support_cases
for update
to anon
using (repair_approval_status = 'pending')
with check (repair_approval_status in ('accepted', 'declined'));

create policy "authenticated can insert support events"
on public.support_events
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support events"
on public.support_events
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete support events"
on public.support_events
for delete
to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can read support agents"
on public.support_agents
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "authenticated can insert support agents"
on public.support_agents
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support agents"
on public.support_agents
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete support agents"
on public.support_agents
for delete
to authenticated
using (auth.role() = 'authenticated');

create policy "public can read support images"
on public.support_images
for select
to anon, authenticated
using (true);

create policy "authenticated can insert support images"
on public.support_images
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support images"
on public.support_images
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete support images"
on public.support_images
for delete
to authenticated
using (auth.role() = 'authenticated');

create policy "public can read support images in storage"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'support-images');

create policy "authenticated can upload support images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'support-images');

create policy "authenticated can update support images"
on storage.objects
for update
to authenticated
using (bucket_id = 'support-images')
with check (bucket_id = 'support-images');

create policy "authenticated can delete support images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'support-images');

create policy "public can read manufacturers"
on public.manufacturers
for select
to anon, authenticated
using (true);

create policy "authenticated can insert manufacturers"
on public.manufacturers
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update manufacturers"
on public.manufacturers
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete manufacturers"
on public.manufacturers
for delete
to authenticated
using (auth.role() = 'authenticated');

create policy "public can read printer models"
on public.printer_models
for select
to anon, authenticated
using (true);

create policy "authenticated can insert printer models"
on public.printer_models
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update printer models"
on public.printer_models
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete printer models"
on public.printer_models
for delete
to authenticated
using (auth.role() = 'authenticated');

create policy "public can read support event types"
on public.support_event_types
for select
to anon, authenticated
using (true);

create policy "authenticated can insert support event types"
on public.support_event_types
for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated can update support event types"
on public.support_event_types
for update
to authenticated
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "authenticated can delete support event types"
on public.support_event_types
for delete
to authenticated
using (auth.role() = 'authenticated');

insert into public.manufacturers (name)
values ('Ribetec')
on conflict (name) do nothing;

insert into public.support_agents (full_name, position)
values ('Equipo Tectronic', 'Agente de soporte')
on conflict (full_name) do nothing;

insert into public.printer_models (manufacturer_id, name, part_number)
select id, 'RT-420ME', 'RT-420ME'
from public.manufacturers
where name = 'Ribetec'
on conflict (manufacturer_id, name) do nothing;

insert into public.support_event_types (name, code, event_type, support_type, description, sort_order)
values
  ('Equipo recibido', 'equipo_recibido', 'ticket_created', 'technical', 'El equipo fue recibido para iniciar el soporte técnico.', 10),
  ('En revisión', 'en_revision', 'diagnosis', 'technical', 'El equipo está en revisión técnica.', 20),
  ('Diagnóstico', 'diagnostico', 'diagnosis', 'technical', 'Se registró el diagnóstico del equipo.', 30),
  ('Esperando refacciones', 'esperando_refacciones', 'note', 'technical', 'El soporte está esperando refacciones para continuar.', 40),
  ('Equipo listo para entrega', 'equipo_listo_entrega', 'note', 'technical', 'El equipo está listo para entrega.', 60),
  ('Equipo entregado', 'equipo_entregado', 'closed', 'technical', 'El equipo fue entregado.', 70),
  ('Preparando propuesta', 'preparando_propuesta', 'ticket_created', 'programming', 'Se está preparando la propuesta de programación.', 10),
  ('Propuesta enviada', 'propuesta_enviada', 'note', 'programming', 'La propuesta fue enviada.', 20),
  ('Propuesta firmada', 'propuesta_firmada', 'note', 'programming', 'La propuesta fue firmada.', 30),
  ('Desarrollando la programación', 'desarrollando_programacion', 'repair', 'programming', 'La programación está en desarrollo.', 40),
  ('Realizando pruebas', 'realizando_pruebas', 'diagnosis', 'programming', 'La programación está en fase de pruebas.', 50),
  ('Programación concluida', 'programacion_concluida', 'note', 'programming', 'La programación fue concluida.', 60),
  ('Listo para envío', 'listo_para_envio', 'note', 'programming', 'La programación está lista para envío.', 70),
  ('Enviada', 'enviada', 'closed', 'programming', 'La programación fue enviada.', 80)
on conflict (code) do nothing;

do $$
declare
  job_missing boolean;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select not exists (select 1 from cron.job where jobname = ''repair-approval-expiry'')'
    into job_missing;

    if job_missing then
      perform cron.schedule(
        'repair-approval-expiry',
        '*/15 * * * *',
        'select app_private.move_declined_repairs_to_ready();'
      );
    end if;
  end if;
end;
$$;
