-- profiles_self_select 정책을 security definer 헬퍼로 교체.
-- 기존: exists(select 1 from profiles p where p.id = auth.uid() and p.is_super_admin=true)
-- 이 inner select 자체에 RLS 가 다시 적용되면서 super_admin 이 본인 외 profile 을
-- 못 읽는 엣지케이스가 발견됨 (멤버 탭에서 두번째 프로필 email 공란으로 렌더).
-- 해결: public.is_super_admin() (Phase 5 에서 security definer 로 생성) 재사용.

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_super_admin()
  );
