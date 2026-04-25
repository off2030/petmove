-- memberships SELECT 정책 확장 — 같은 org 의 모든 멤버가 서로 보이도록.
-- 이전: 본인 + super_admin + admin 만 같은 org 의 멤버 select 가능 (member 는 본인 외 못 봄)
-- 이후: 같은 org 의 member 도 모든 멤버 select 가능 (UX: 멤버 탭에서 누가 있는지 파악)

drop policy if exists memberships_select on public.memberships;

create policy memberships_select on public.memberships
  for select using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_org_member(org_id)
  );
