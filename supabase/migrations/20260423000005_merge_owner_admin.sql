-- Phase 14: owner/admin 역할 통합 → 2-tier 시스템 (admin, member)
-- 실질적으로 owner == admin 이었으므로 (is_org_admin 이 둘 다 true 반환) 의미론 정리.
-- 추가: admin 은 자기 조직 memberships 수정 가능 + last-admin 보호 트리거.

-- ─────────────────────────────────────────────────
-- 1. 기존 'owner' 데이터를 'admin' 으로 전환
-- ─────────────────────────────────────────────────

update public.memberships set role = 'admin' where role = 'owner';
update public.organization_invites set role = 'admin' where role = 'owner';

-- ─────────────────────────────────────────────────
-- 2. check constraint 재정의 — 'owner' 제거
-- ─────────────────────────────────────────────────

alter table public.memberships
  drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('admin','member'));

alter table public.organization_invites
  drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check check (role in ('admin','member'));

-- ─────────────────────────────────────────────────
-- 3. is_org_admin() 단순화 — 'admin' 만 체크
-- ─────────────────────────────────────────────────

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id = p_org_id
      and role = 'admin'
  )
$$;

-- ─────────────────────────────────────────────────
-- 4. RLS: admin 이 자기 조직 memberships 수정/삭제 가능
--    INSERT 는 여전히 super_admin 만 (일반 플로우는 invite 수락 = service role).
-- ─────────────────────────────────────────────────

drop policy if exists memberships_write on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_insert on public.memberships
  for insert with check (public.is_super_admin());

create policy memberships_update on public.memberships
  for update
    using (public.is_super_admin() or public.is_org_admin(org_id))
    with check (public.is_super_admin() or public.is_org_admin(org_id));

create policy memberships_delete on public.memberships
  for delete using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─────────────────────────────────────────────────
-- 5. Last-admin 보호 트리거
--    admin → member 강등 또는 admin 삭제 시 해당 조직의 admin 수가 0 이 되면 reject.
--    service role (auth.uid() null) 은 bypass — 조직 삭제/유지보수용.
-- ─────────────────────────────────────────────────

create or replace function public.ensure_last_admin_on_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_admin_count int;
begin
  -- service role 은 통과 (RLS 우회한 admin 클라이언트)
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- admin 제거/강등 케이스만 체크
  if tg_op = 'DELETE' and old.role = 'admin' then
    -- 체크 진행
    null;
  elsif tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin' then
    -- 체크 진행
    null;
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*) into v_other_admin_count
    from public.memberships
   where org_id = old.org_id
     and role = 'admin'
     and id <> old.id;

  if v_other_admin_count = 0 then
    raise exception '조직에 최소 1명의 관리자가 남아 있어야 합니다' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists memberships_ensure_last_admin on public.memberships;
create trigger memberships_ensure_last_admin
  before update or delete on public.memberships
  for each row execute function public.ensure_last_admin_on_memberships();
