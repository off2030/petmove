-- 사용자 프로필 이미지 — Storage 버킷 + RLS
-- 경로 규칙: {user_id}/{uuid}_{원본파일명}
-- RLS: 본인 폴더에만 write/delete. read 는 누구나 (public bucket — 채팅 등 다른 사용자에게도 노출되어야 함).

-- ─────────────────────────────────────────────────
-- 1. 버킷 (public, 5MB 제한)
-- ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-avatars', 'user-avatars', true, 5242880)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      public = excluded.public;

-- ─────────────────────────────────────────────────
-- 2. RLS — user-avatars 객체 접근
-- ─────────────────────────────────────────────────
-- 첫 번째 폴더 = auth.uid().

drop policy if exists user_avatars_select on storage.objects;
create policy user_avatars_select on storage.objects
  for select using (bucket_id = 'user-avatars');

drop policy if exists user_avatars_insert on storage.objects;
create policy user_avatars_insert on storage.objects
  for insert
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists user_avatars_update_own on storage.objects;
create policy user_avatars_update_own on storage.objects
  for update using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists user_avatars_delete_own on storage.objects;
create policy user_avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'user-avatars'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
