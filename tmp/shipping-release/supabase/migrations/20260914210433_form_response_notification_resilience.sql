create or replace function private.create_form_response_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_form public.forms%rowtype;
  display_name text;
begin
  select *
  into target_form
  from public.forms
  where id = new.form_id;

  if target_form.id is null then
    return new;
  end if;

  display_name := coalesce(nullif(trim(new.respondent_name), ''), nullif(trim(new.respondent_email), ''), 'Respuesta anónima');

  begin
    insert into public.form_notifications (
      user_id,
      form_id,
      response_id,
      title,
      message,
      answers
    )
    values (
      target_form.owner_user_id,
      new.form_id,
      new.id,
      'Nueva respuesta en ' || target_form.title,
      display_name || ' respondió el formulario.',
      new.answers
    );
  exception
    when others then
      raise warning 'No se pudo crear la notificación del formulario %. Respuesta guardada: %', new.form_id, sqlerrm;
  end;

  return new;
end;
$$;

notify pgrst, 'reload schema';
