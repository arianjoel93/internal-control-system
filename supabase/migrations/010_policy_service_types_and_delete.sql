alter table public.policy_services
  add column if not exists service_type text not null default 'Soporte Remoto',
  add column if not exists notes text;

alter table public.policy_services
  drop constraint if exists policy_services_service_type_check;

alter table public.policy_services
  add constraint policy_services_service_type_check
  check (service_type in ('Programación', 'Soporte Remoto', 'Soporte Tectronic', 'Instalación', 'Software', 'Mantenimiento'));

create index if not exists policy_services_type_idx
on public.policy_services (service_type);

drop policy if exists "authenticated can delete policy services" on public.policy_services;
create policy "authenticated can delete policy services"
on public.policy_services
for delete
to authenticated
using ((select auth.role()) = 'authenticated');

grant delete on public.policy_services to authenticated;
