-- /apply 공개 신청폼이 새 publishable key (sb_publishable_*) 사용 시 RLS 위반 fix.
-- 기존 정책은 `to anon` 으로 한정돼 있었지만, sb_publishable 키는 더 이상 'anon'
-- role 로 매핑되지 않을 수 있어 매치되지 않음.
-- with check 의 org_id 제약은 그대로 유지하여 보안 동등.

drop policy if exists cases_anon_apply on public.cases;
create policy cases_anon_apply on public.cases
  for insert
  with check (org_id = '00000000-0000-0000-0000-000000000001');
