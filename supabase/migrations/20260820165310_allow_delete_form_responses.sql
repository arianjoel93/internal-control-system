drop policy if exists "responses delete with parent form access" on public.form_responses;
create policy "responses delete with parent form access"
on public.form_responses for delete
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
            and items.can_access = true
            and coalesce((items.actions ->> 'delete')::boolean, false) = true
        )
      )
  )
);

grant delete on public.form_responses to authenticated;

notify pgrst, 'reload schema';
