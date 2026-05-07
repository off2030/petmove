-- =============================================================================
-- cases_anon_apply 정책 제거.
--   /apply 서버 액션 (lib/actions/apply-case.ts) 은 createAdminClient (service_role)
--   로 RLS 를 우회하므로 이 정책을 사용하지 않는다.
--   정책이 살아있으면 publishable key 만으로 누구나 Rojan org 에 직접 cases.insert
--   호출 가능 → spam INSERT 공격 표면. 제거.
-- =============================================================================

drop policy if exists cases_anon_apply on public.cases;
