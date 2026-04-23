-- 같은 org 에 속한 멤버끼리는 서로의 profile (email/name) 을 조회 가능하도록.
-- 증상: 설정 > 멤버 탭에서 본인 외 멤버가 email/name 공란으로 렌더링됨.
-- 원인: profiles_self_select 가 auth.uid() = id 혹은 super_admin 만 허용.
-- 해결: 동일 org 멤버십을 공유하는 경우에도 SELECT 허용하는 별도 PERMISSIVE 정책 추가.

create policy profiles_same_org_select on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.memberships m1
        join public.memberships m2 on m1.org_id = m2.org_id
       where m1.user_id = auth.uid()
         and m2.user_id = profiles.id
    )
  );
