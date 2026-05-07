-- =============================================================================
-- attachments 버킷 보안 강화: public → private + org 멤버십 기반 RLS.
--   기존 정책: "Allow all on attachments" — bucket_id 만 검사, 모든 role 모든 op 허용.
--     → publishable / anon key 만으로 임의의 케이스 첨부파일 GET/DELETE/PUT 가능.
--   변경:
--     1) 버킷을 private 으로 (getPublicUrl 무효화 — 클라이언트는 createSignedUrl 사용).
--     2) 4개 정책으로 분리: SELECT/INSERT/UPDATE/DELETE 각각 org 멤버십 체크.
--   경로 규약: '{caseId}/{filename}' — 첫 폴더가 cases.id.
--   예외: super_admin 은 헬퍼로 우회.
-- =============================================================================

-- 1. 버킷 private 화 (없으면 생성).
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update set public = false;

-- 2. 기존 개방 정책 제거.
drop policy if exists "Allow all on attachments" on storage.objects;

-- 3. 케이스 소유 org 멤버만 접근 가능한 정책 4개.
--    (storage.foldername(name))[1] = '{caseId}' 부분.
create policy attachments_select on storage.objects
  for select
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.cases c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_org_member(c.org_id) or public.is_super_admin())
    )
  );

create policy attachments_insert on storage.objects
  for insert
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.cases c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_org_member(c.org_id) or public.is_super_admin())
    )
  );

create policy attachments_update on storage.objects
  for update
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.cases c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_org_member(c.org_id) or public.is_super_admin())
    )
  )
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.cases c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_org_member(c.org_id) or public.is_super_admin())
    )
  );

create policy attachments_delete on storage.objects
  for delete
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.cases c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_org_member(c.org_id) or public.is_super_admin())
    )
  );
