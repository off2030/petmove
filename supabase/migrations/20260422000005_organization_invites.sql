-- Phase 10: organization_invites + memberships SELECT 정책 확장.
-- 초대 토큰 기반 가입 플로우 — owner/admin 이 초대 생성, 수락 시 자동 membership 추가.

-- ─────────────────────────────────────────────────
-- 헬퍼: 현재 유저가 org 의 owner/admin 인가?
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
      and role in ('owner','admin')
  )
$$;

-- ─────────────────────────────────────────────────
-- memberships SELECT 확장: owner/admin 은 같은 org 의 멤버를 조회 가능
-- ─────────────────────────────────────────────────

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_org_admin(org_id)
  );

-- ─────────────────────────────────────────────────
-- organization_invites 테이블
-- ─────────────────────────────────────────────────

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  constraint organization_invites_role_check check (role in ('owner','admin','member'))
);

create index if not exists organization_invites_org_idx on public.organization_invites (org_id);
create index if not exists organization_invites_email_idx on public.organization_invites (lower(email));

-- ─────────────────────────────────────────────────
-- RLS: 생성·조회·삭제 모두 owner/admin 또는 super_admin 만
-- 수락 플로우는 service role 로 우회 (acceptInvite server action)
-- ─────────────────────────────────────────────────

alter table public.organization_invites enable row level security;

drop policy if exists organization_invites_select on public.organization_invites;
create policy organization_invites_select on public.organization_invites
  for select using (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists organization_invites_insert on public.organization_invites;
create policy organization_invites_insert on public.organization_invites
  for insert with check (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists organization_invites_delete on public.organization_invites;
create policy organization_invites_delete on public.organization_invites
  for delete using (public.is_org_admin(org_id) or public.is_super_admin());

-- update 는 acceptInvite (service role) 가 유일 → 일반 policy 생략
