-- DB 무결성 invariant 검증.
--
-- 일부 RLS 정책은 트리거와 짝을 이뤄 동작한다. 트리거가 drop/disable 되면 RLS 만으로는
-- 잘못된 상태 전이가 가능해진다. 마이그레이션·스키마 변경 직후, 그리고 운영 중 정기적으로
-- 본 SQL 을 적용해 invariant 가 유지되는지 점검한다.
--
-- 실행: supabase db query --linked < apps/admin/scripts/verify-db-invariants.sql
--   (또는: npm --prefix apps/admin run verify:db)
-- 종료코드: 모든 invariant 통과 시 0, 누락 시 raise exception 으로 실패.
--
-- 검증 1) case_transfers 상태 전이 트리거 (P1 #6)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'case_transfers_validate_status_change'
      and tgrelid = 'public.case_transfers'::regclass
      and not tgisinternal
  ) then
    raise exception 'case_transfers_validate_status_change trigger 누락 — '
      'pending → accepted/rejected/cancelled 상태 전이 검증이 무효화됨. '
      '20260503000001_case_handoff.sql 마이그레이션 재적용 필요.';
  end if;
end $$;

select 'all db invariants verified' as result;
