-- profiles_self_select 정책의 EXISTS 서브쿼리가 자기 참조 → 재귀 우려.
-- 서버 미들웨어는 본인 로우만 조회하면 되므로 단순화.
-- super_admin 이 전체 조회해야 할 때는 service_role 또는 별도 RPC 사용.

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);
