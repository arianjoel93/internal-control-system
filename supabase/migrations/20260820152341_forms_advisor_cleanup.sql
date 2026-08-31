create index if not exists form_notifications_response_idx
on public.form_notifications (response_id);

drop policy if exists "questions write with parent form access" on public.form_questions;

create policy "questions insert with parent form access"
on public.form_questions for insert
to authenticated
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

create policy "questions update with parent form access"
on public.form_questions for update
to authenticated
using (
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

create policy "questions delete with parent form access"
on public.form_questions for delete
to authenticated
using (
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

notify pgrst, 'reload schema';
