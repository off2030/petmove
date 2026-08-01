-- cases 목록 조회 복합 인덱스.
--
-- admin listActiveOrgCases 는 org_id 필터 + created_at desc 정렬 + deleted_at is null
-- 조건으로 케이스 목록을 읽는다. 기존에는 이 조합을 커버하는 인덱스가 없어 org 케이스가
-- 늘수록 정렬 비용이 커졌다. partial index(where deleted_at is null)로 활성 케이스만
-- 인덱싱해 목록 쿼리가 index scan + 정렬 생략으로 처리되게 한다.
create index if not exists cases_org_created_active_idx
  on cases (org_id, created_at desc)
  where deleted_at is null;
