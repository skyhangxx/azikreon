-- Apply in Supabase SQL Editor. Does NOT create an Auth user or administrator.
begin;
create schema if not exists cms_private;
revoke all on schema cms_private from public, anon, authenticated;
create table if not exists cms_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table cms_private.admins enable row level security;
revoke all on cms_private.admins from public, anon, authenticated;

create or replace function public.cms_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from cms_private.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.cms_is_admin() from public;
grant execute on function public.cms_is_admin() to anon, authenticated;

create table if not exists public.cms_teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 6000),
  image_path text not null check (image_path ~ '^teachers/[a-f0-9-]+\.(jpg|png|webp)$' or image_path in ('/assets/images/teacher-hwain.webp', '/assets/images/teacher-jaehyuk.webp')),
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cms_reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null check (char_length(btrim(location)) between 1 and 160),
  description text not null check (char_length(btrim(description)) between 1 and 6000),
  image_path text not null check (image_path ~ '^reviews/[a-f0-9-]+\.(jpg|png|webp)$'),
  stars smallint not null check (stars between 1 and 5),
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cms_media (
  path text primary key check (path ~ '^(teachers|reviews)/[a-f0-9-]+\.(jpg|png|webp)$'),
  created_at timestamptz not null default now()
);
create index if not exists cms_teachers_public_order on public.cms_teachers (is_published, sort_order, id);
create index if not exists cms_reviews_public_order on public.cms_reviews (is_published, sort_order, id);
create index if not exists cms_teachers_image on public.cms_teachers (image_path);
create index if not exists cms_reviews_image on public.cms_reviews (image_path);

create or replace function cms_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;
drop trigger if exists cms_teachers_updated on public.cms_teachers;
create trigger cms_teachers_updated before update on public.cms_teachers for each row execute function cms_private.touch_updated_at();
drop trigger if exists cms_reviews_updated on public.cms_reviews;
create trigger cms_reviews_updated before update on public.cms_reviews for each row execute function cms_private.touch_updated_at();

alter table public.cms_teachers enable row level security;
alter table public.cms_reviews enable row level security;
alter table public.cms_media enable row level security;
revoke all on public.cms_teachers, public.cms_reviews, public.cms_media from anon, authenticated;
grant select on public.cms_teachers, public.cms_reviews to anon, authenticated;
grant insert, update, delete on public.cms_teachers, public.cms_reviews to authenticated;
grant select, insert, delete on public.cms_media to authenticated;

drop policy if exists cms_teachers_read on public.cms_teachers;
create policy cms_teachers_read on public.cms_teachers for select to anon, authenticated using (is_published or (select public.cms_is_admin()));
drop policy if exists cms_teachers_insert on public.cms_teachers;
create policy cms_teachers_insert on public.cms_teachers for insert to authenticated with check ((select public.cms_is_admin()));
drop policy if exists cms_teachers_update on public.cms_teachers;
create policy cms_teachers_update on public.cms_teachers for update to authenticated using ((select public.cms_is_admin())) with check ((select public.cms_is_admin()));
drop policy if exists cms_teachers_delete on public.cms_teachers;
create policy cms_teachers_delete on public.cms_teachers for delete to authenticated using ((select public.cms_is_admin()));
drop policy if exists cms_reviews_read on public.cms_reviews;
create policy cms_reviews_read on public.cms_reviews for select to anon, authenticated using (is_published or (select public.cms_is_admin()));
drop policy if exists cms_reviews_insert on public.cms_reviews;
create policy cms_reviews_insert on public.cms_reviews for insert to authenticated with check ((select public.cms_is_admin()));
drop policy if exists cms_reviews_update on public.cms_reviews;
create policy cms_reviews_update on public.cms_reviews for update to authenticated using ((select public.cms_is_admin())) with check ((select public.cms_is_admin()));
drop policy if exists cms_reviews_delete on public.cms_reviews;
create policy cms_reviews_delete on public.cms_reviews for delete to authenticated using ((select public.cms_is_admin()));
drop policy if exists cms_media_admin on public.cms_media;
create policy cms_media_admin on public.cms_media for all to authenticated using ((select public.cms_is_admin())) with check ((select public.cms_is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cms-images', 'cms-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists cms_images_read on storage.objects;
create policy cms_images_read on storage.objects for select to authenticated
using (bucket_id = 'cms-images' and (select public.cms_is_admin()));
drop policy if exists cms_images_insert on storage.objects;
create policy cms_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'cms-images' and (select public.cms_is_admin()) and name ~ '^(teachers|reviews)/[a-f0-9-]+\.(jpg|png|webp)$');
-- Replacements always get a new path: overwriting existing images is unnecessary.
drop policy if exists cms_images_delete on storage.objects;
create policy cms_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'cms-images' and (select public.cms_is_admin())
  and not exists (select 1 from public.cms_teachers t where t.image_path = storage.objects.name)
  and not exists (select 1 from public.cms_reviews r where r.image_path = storage.objects.name));

-- One-hour grace period protects uploads in progress and ambiguous network responses.
-- Includes hidden records when checking references. Actual deletion uses Storage API.
create or replace function public.cms_unused_media() returns table(path text)
language sql stable security definer set search_path = '' as $$
  select m.path from public.cms_media m
  where (select public.cms_is_admin()) and m.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.cms_teachers t where t.image_path = m.path)
    and not exists (select 1 from public.cms_reviews r where r.image_path = m.path)
  order by m.created_at limit 100;
$$;
revoke all on function public.cms_unused_media() from public, anon;
grant execute on function public.cms_unused_media() to authenticated;
commit;
