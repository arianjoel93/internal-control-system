insert into public.support_agents (full_name, position)
values ('Equipo Tectronic', 'Agente de soporte')
on conflict (full_name) do nothing;

insert into public.support_cases (
  folio,
  support_type,
  customer_name,
  customer_email,
  customer_phone,
  performed_by,
  manufacturer,
  printer_model,
  part_number,
  serial_number,
  sale_date,
  warranty_end_date,
  status,
  issue_summary,
  resolution_notes
) values (
  '9635',
  'technical',
  'Cliente demo',
  'cliente@example.com',
  '555-0101',
  'Equipo Tectronic',
  'Ribetec',
  'RT-420ME',
  'RT-420ME',
  'RT420ME2110250411',
  '2021-12-30',
  '2022-12-30',
  'closed',
  'Creación de ticket para revisión de impresora.',
  'Soporte demo cerrado.'
);

insert into public.support_events (
  support_case_id,
  event_type,
  title,
  event_date,
  ticket_reference
)
select
  id,
  'ticket_created',
  'Equipo recibido',
  '2024-05-09 21:03:12-06',
  '9635'
from public.support_cases
where folio = '9635';

insert into public.support_events (
  support_case_id,
  event_type,
  title,
  event_date,
  ticket_reference
)
select
  id,
  'diagnosis',
  'En revisión',
  '2024-05-20 23:27:31-06',
  '9635'
from public.support_cases
where folio = '9635';
