alter table public.support_events
add column if not exists shipping_carrier text,
add column if not exists tracking_number text;

update storage.buckets
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'application/pdf']
where id = 'support-images';

alter table public.support_images
drop constraint if exists support_images_sort_order_check;

alter table public.support_images
add constraint support_images_sort_order_check
check (sort_order between 0 and 99);

create or replace function public.enforce_support_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mime_type like 'image/%' and (
    select count(*)
    from public.support_images
    where support_case_id = new.support_case_id
      and mime_type like 'image/%'
  ) >= 4 then
    raise exception 'Cada soporte puede tener como máximo 4 imágenes.';
  end if;

  return new;
end;
$$;
