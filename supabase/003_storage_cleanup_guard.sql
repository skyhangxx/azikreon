-- Apply after 001/002. Preserve existing content, objects and bucket settings.
-- Enforce the cleanup registry and upload grace period even for direct API calls.
begin;
drop policy if exists cms_images_delete on storage.objects;
create policy cms_images_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'cms-images'
  and (select public.cms_is_admin())
  and name ~ '^(teachers|reviews)/[a-f0-9-]+\.(jpg|png|webp)$'
  and exists (
    select 1 from public.cms_media m
    where m.path = storage.objects.name and m.created_at < now() - interval '1 hour'
  )
  and not exists (select 1 from public.cms_teachers t where t.image_path = storage.objects.name)
  and not exists (select 1 from public.cms_reviews r where r.image_path = storage.objects.name)
);
commit;
