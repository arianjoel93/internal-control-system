alter table public.admin_module_permissions
  add column if not exists can_access_forms boolean not null default false;

alter table public.admin_module_permission_items
  drop constraint if exists admin_module_permission_items_module_key_check;

alter table public.admin_module_permission_items
  add constraint admin_module_permission_items_module_key_check
  check (module_key in ('supports', 'inventory', 'policies', 'reports', 'purchases', 'marketing', 'forms', 'calculator', 'meeting_room', 'quoting'));

update public.admin_module_permissions
set can_access_forms = true
where role = 'owner'
   or user_type = 'owner'
   or lower(email) = 'joeltrincadov@gmail.com';

create or replace function private.enforce_owner_permission_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'joeltrincadov@gmail.com' then
    if tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = 'joeltrincadov@gmail.com'
       and lower(coalesce(new.email, '')) <> lower(coalesce(old.email, '')) then
      raise exception 'El correo del Propietario principal no puede cambiarse.';
    end if;
    new.role := 'owner';
    new.user_type := 'owner';
    new.is_active := true;
  end if;

  if new.role = 'owner' then
    new.user_type := 'owner';
    new.can_access_supports := true;
    new.can_access_inventory := true;
    new.can_access_policies := true;
    new.can_access_reports := true;
    new.can_access_purchases := true;
    new.can_access_marketing := true;
    new.can_access_forms := true;
    new.can_access_quoting := true;
    new.can_access_calculator := true;
  end if;

  return new;
end;
$$;

insert into public.admin_module_permission_items (
  permission_id,
  user_id,
  module_key,
  can_access,
  visibility_scope,
  actions
)
select
  permissions.id,
  permissions.user_id,
  'forms',
  permissions.can_access_forms,
  'all',
  jsonb_build_object(
    'view', permissions.can_access_forms,
    'create', permissions.can_access_forms,
    'edit', permissions.can_access_forms,
    'delete', false,
    'export', permissions.can_access_forms
  )
from public.admin_module_permissions permissions
on conflict (user_id, module_key) do nothing;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Formulario sin título',
  description text not null default '',
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  theme text not null default 'terracotta' check (theme in ('terracotta', 'ocean', 'forest', 'sand', 'graphite')),
  submit_label text not null default 'Enviar respuesta',
  thank_you_title text not null default 'Respuesta enviada',
  thank_you_message text not null default 'Gracias por responder. Tu información fue registrada correctamente.',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  label text not null,
  help_text text not null default '',
  question_type text not null check (question_type in ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'dropdown', 'rating')),
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  placeholder text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  respondent_name text,
  respondent_email text,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  user_agent text
);

create table if not exists public.form_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  response_id uuid references public.form_responses(id) on delete cascade,
  title text not null,
  message text not null,
  answers jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists forms_owner_created_idx
on public.forms (owner_user_id, created_at desc);

create index if not exists forms_status_slug_idx
on public.forms (status, slug);

create index if not exists form_questions_form_sort_idx
on public.form_questions (form_id, sort_order);

create index if not exists form_responses_form_submitted_idx
on public.form_responses (form_id, submitted_at desc);

create index if not exists form_notifications_user_created_idx
on public.form_notifications (user_id, created_at desc);

create index if not exists form_notifications_form_created_idx
on public.form_notifications (form_id, created_at desc);

alter table public.forms enable row level security;
alter table public.form_questions enable row level security;
alter table public.form_responses enable row level security;
alter table public.form_notifications enable row level security;

drop policy if exists "forms read with module access or public published" on public.forms;
create policy "forms read with module access or public published"
on public.forms for select
to anon, authenticated
using (
  status = 'published'
  or exists (
    select 1
    from public.admin_module_permission_items items
    where items.user_id = (select auth.uid())
      and items.module_key = 'forms'
      and items.can_access
      and (
        items.visibility_scope = 'all'
        or owner_user_id = (select auth.uid())
      )
  )
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and (
        permissions.role = 'owner'
        or permissions.user_type = 'owner'
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
);

drop policy if exists "forms create with module access" on public.forms;
create policy "forms create with module access"
on public.forms for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and (
    exists (
      select 1
      from public.admin_module_permission_items items
      where items.user_id = (select auth.uid())
        and items.module_key = 'forms'
        and items.can_access
    )
    or exists (
      select 1
      from public.admin_module_permissions permissions
      where permissions.user_id = (select auth.uid())
        and permissions.is_active
        and (
          permissions.role = 'owner'
          or permissions.user_type = 'owner'
          or lower(permissions.email) = 'joeltrincadov@gmail.com'
        )
    )
  )
);

drop policy if exists "forms update with module access" on public.forms;
create policy "forms update with module access"
on public.forms for update
to authenticated
using (
  exists (
    select 1
    from public.admin_module_permission_items items
    where items.user_id = (select auth.uid())
      and items.module_key = 'forms'
      and items.can_access
      and (
        items.visibility_scope = 'all'
        or owner_user_id = (select auth.uid())
      )
  )
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and (
        permissions.role = 'owner'
        or permissions.user_type = 'owner'
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
)
with check (
  owner_user_id = owner_user_id
);

drop policy if exists "forms delete with module access" on public.forms;
create policy "forms delete with module access"
on public.forms for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
  or exists (
    select 1
    from public.admin_module_permissions permissions
    where permissions.user_id = (select auth.uid())
      and permissions.is_active
      and (
        permissions.role = 'owner'
        or permissions.user_type = 'owner'
        or lower(permissions.email) = 'joeltrincadov@gmail.com'
      )
  )
);

drop policy if exists "questions read with parent form" on public.form_questions;
create policy "questions read with parent form"
on public.form_questions for select
to anon, authenticated
using (
  exists (
    select 1
    from public.forms forms
    where forms.id = form_questions.form_id
  )
);

drop policy if exists "questions write with parent form access" on public.form_questions;
create policy "questions write with parent form access"
on public.form_questions for all
to authenticated
using (
  exists (
    select 1
    from public.forms forms
    where forms.id = form_questions.form_id
      and forms.status in ('draft', 'published', 'closed')
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access
            and items.visibility_scope = 'all'
        )
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and (
              permissions.role = 'owner'
              or permissions.user_type = 'owner'
              or lower(permissions.email) = 'joeltrincadov@gmail.com'
            )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.forms forms
    where forms.id = form_questions.form_id
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access
            and items.visibility_scope = 'all'
        )
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and (
              permissions.role = 'owner'
              or permissions.user_type = 'owner'
              or lower(permissions.email) = 'joeltrincadov@gmail.com'
            )
        )
      )
  )
);

drop policy if exists "responses insert public published forms" on public.form_responses;
create policy "responses insert public published forms"
on public.form_responses for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.forms forms
    where forms.id = form_responses.form_id
      and forms.status = 'published'
  )
);

drop policy if exists "responses read with parent form access" on public.form_responses;
create policy "responses read with parent form access"
on public.form_responses for select
to authenticated
using (
  exists (
    select 1
    from public.forms forms
    where forms.id = form_responses.form_id
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access
            and items.visibility_scope = 'all'
        )
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and (
              permissions.role = 'owner'
              or permissions.user_type = 'owner'
              or lower(permissions.email) = 'joeltrincadov@gmail.com'
            )
        )
      )
  )
);

drop policy if exists "form notifications read visible" on public.form_notifications;
create policy "form notifications read visible"
on public.form_notifications for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.forms forms
    where forms.id = form_notifications.form_id
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access
            and items.visibility_scope = 'all'
        )
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and (
              permissions.role = 'owner'
              or permissions.user_type = 'owner'
              or lower(permissions.email) = 'joeltrincadov@gmail.com'
            )
        )
      )
  )
);

drop policy if exists "form notifications update visible" on public.form_notifications;
create policy "form notifications update visible"
on public.form_notifications for update
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.forms forms
    where forms.id = form_notifications.form_id
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access
            and items.visibility_scope = 'all'
        )
        or exists (
          select 1
          from public.admin_module_permissions permissions
          where permissions.user_id = (select auth.uid())
            and permissions.is_active
            and (
              permissions.role = 'owner'
              or permissions.user_type = 'owner'
              or lower(permissions.email) = 'joeltrincadov@gmail.com'
            )
        )
      )
  )
)
with check (
  user_id = user_id
);

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

  return new;
end;
$$;

drop trigger if exists create_form_response_notification_trigger on public.form_responses;
create trigger create_form_response_notification_trigger
after insert on public.form_responses
for each row
execute function private.create_form_response_notification();

do $$
begin
  alter publication supabase_realtime add table public.form_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

grant select, insert, update, delete on public.forms to authenticated;
grant select on public.forms to anon;
grant select, insert, update, delete on public.form_questions to authenticated;
grant select on public.form_questions to anon;
grant select, insert on public.form_responses to authenticated;
grant insert on public.form_responses to anon;
grant select, update on public.form_notifications to authenticated;

notify pgrst, 'reload schema';
