-- Phase A 채팅 첨부파일 — Storage 버킷 + RLS
-- 경로 규칙: {conv_id}/{uuid}_{원본파일명}
-- RLS: 해당 채널 (conversations) 참여자만 read/write/delete.

-- ─────────────────────────────────────────────────
-- 1. 버킷 생성 (private, 25MB 제한)
-- ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      public = excluded.public;

-- ─────────────────────────────────────────────────
-- 2. RLS — chat-files 객체 접근
-- ─────────────────────────────────────────────────
-- 첫 번째 폴더 = conv_id (uuid). 그 채널의 user_a/user_b 또는 super_admin 만 통과.

drop policy if exists chat_files_select on storage.objects;
create policy chat_files_select on storage.objects
  for select using (
    bucket_id = 'chat-files'
    and (
      public.is_super_admin()
      or exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(name))[1]
          and auth.uid() in (c.user_a_id, c.user_b_id)
      )
    )
  );

drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects
  for insert
  with check (
    bucket_id = 'chat-files'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and auth.uid() in (c.user_a_id, c.user_b_id)
    )
  );

-- 본인이 올린 객체만 삭제 가능 (owner = auth.uid()).
-- super_admin 은 별도 정책으로 허용.
drop policy if exists chat_files_delete_own on storage.objects;
create policy chat_files_delete_own on storage.objects
  for delete using (
    bucket_id = 'chat-files'
    and (
      public.is_super_admin()
      or owner = auth.uid()
    )
  );

-- 주의: storage.objects 의 COMMENT ON POLICY 는 supabase_storage_admin 소유권이
-- 필요해서 일반 마이그레이션 러너로도 실패. 정책 동작엔 영향 없으므로 생략.
