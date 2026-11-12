alter table public.support_event_types
  add column badge_color text not null default 'slate',
  add constraint support_event_types_badge_color_check
    check (badge_color in ('slate', 'blue', 'violet', 'amber', 'teal', 'green', 'rose'));

update public.support_event_types
set badge_color = case
  when code in ('esperando_refacciones', 'realizando_pruebas') then 'amber'
  when code in ('equipo_listo_entrega', 'listo_para_envio', 'propuesta_firmada') then 'teal'
  when code = 'programacion_concluida' then 'green'
  when code in ('propuesta_enviada', 'design') then 'violet'
  when code = 'en_revision' then 'blue'
  when event_type = 'closed' then 'green'
  when event_type = 'diagnosis' then 'violet'
  when event_type = 'repair' then 'rose'
  when event_type in ('ticket_created', 'remote_support_scheduled') then 'blue'
  else 'slate'
end;

notify pgrst, 'reload schema';
