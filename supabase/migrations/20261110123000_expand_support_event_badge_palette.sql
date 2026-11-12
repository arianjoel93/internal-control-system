alter table public.support_event_types
  drop constraint support_event_types_badge_color_check,
  add constraint support_event_types_badge_color_check
    check (badge_color in (
      'slate', 'mist', 'stone', 'sand', 'rose', 'red', 'blush', 'coral',
      'orange', 'peach', 'apricot', 'amber', 'gold', 'lemon', 'vanilla', 'lime',
      'sage', 'green', 'leaf', 'mint', 'teal', 'jade', 'aqua', 'cyan',
      'sky', 'blue', 'denim', 'periwinkle', 'violet', 'lilac', 'mauve', 'orchid'
    ));

update public.support_event_types as state
set badge_color = preset.color
from (values
  ('equipo_recibido', 'red'),
  ('en_revision', 'orange'),
  ('diagnostico', 'lemon'),
  ('esperando_refacciones', 'gold'),
  ('equipo_listo_entrega', 'sky'),
  ('equipo_entregado', 'leaf'),
  ('preparando_propuesta', 'peach'),
  ('propuesta_enviada', 'periwinkle'),
  ('propuesta_firmada', 'mint'),
  ('desarrollando_programacion', 'lilac'),
  ('realizando_pruebas', 'amber'),
  ('programacion_concluida', 'jade'),
  ('listo_para_envio', 'denim'),
  ('enviada', 'green'),
  ('revision_de_bascula', 'apricot'),
  ('design', 'orchid'),
  ('revision_de_desarrollo', 'vanilla'),
  ('realizar_carga_de_desarrollo', 'cyan')
) as preset(code, color)
where state.code = preset.code
  and state.badge_color is distinct from preset.color;
