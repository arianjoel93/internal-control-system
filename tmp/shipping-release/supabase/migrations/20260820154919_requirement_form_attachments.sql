insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-attachments',
  'form-attachments',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/bmp',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "form attachments upload from public forms" on storage.objects;
create policy "form attachments upload from public forms"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'form-attachments'
  and exists (
    select 1
    from public.forms forms
    where forms.id::text = (storage.foldername(name))[1]
      and forms.status = 'published'
  )
);

drop policy if exists "form attachments read by authenticated users" on storage.objects;
create policy "form attachments read by authenticated users"
on storage.objects for select
to authenticated
using (
  bucket_id = 'form-attachments'
  and exists (
    select 1
    from public.forms forms
    where forms.id::text = (storage.foldername(name))[1]
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access = true
            and coalesce((items.actions ->> 'view')::boolean, false) = true
        )
      )
  )
);

drop policy if exists "form attachments update by authenticated users" on storage.objects;
create policy "form attachments update by authenticated users"
on storage.objects for update
to authenticated
using (
  bucket_id = 'form-attachments'
  and exists (
    select 1
    from public.forms forms
    where forms.id::text = (storage.foldername(name))[1]
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access = true
            and coalesce((items.actions ->> 'edit')::boolean, false) = true
        )
      )
  )
)
with check (
  bucket_id = 'form-attachments'
  and exists (
    select 1
    from public.forms forms
    where forms.id::text = (storage.foldername(name))[1]
      and (
        forms.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.admin_module_permission_items items
          where items.user_id = (select auth.uid())
            and items.module_key = 'forms'
            and items.can_access = true
            and coalesce((items.actions ->> 'edit')::boolean, false) = true
        )
      )
  )
);

drop policy if exists "form attachments delete by authenticated users" on storage.objects;
create policy "form attachments delete by authenticated users"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'form-attachments'
  and exists (
    select 1
    from public.forms forms
    where forms.id::text = (storage.foldername(name))[1]
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
