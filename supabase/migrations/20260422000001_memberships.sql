-- Phase 3: memberships 테이블 + 로잔 단일 테넌트 초기화
-- user ↔ org 연결. role: owner / admin / member.
-- 앱은 아직 사용 안 함 (Phase 5~6 에서 반영) → 운영 영향 0.

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_user_org_unique unique (user_id, org_id),
  constraint memberships_role_check check (role in ('owner','admin','member'))
);

create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx  on public.memberships (org_id);

-- updated_at 자동 갱신
create or replace function public.touch_memberships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists memberships_updated_at on public.memberships;
create trigger memberships_updated_at
  before update on public.memberships
  for each row execute function public.touch_memberships_updated_at();

-- RLS 는 Phase 5 에서. 지금은 off.
alter table public.memberships disable row level security;

-- ───────────────────────────────────────────────
-- 시드: 기존 "PetMove" org → "로잔동물의료센터" rename + petmove@naver.com owner 삽입.
-- 모두 idempotent.
-- ───────────────────────────────────────────────

update public.organizations
   set name = '로잔동물의료센터',
       updated_at = now()
 where id = '00000000-0000-0000-0000-000000000001'
   and name = 'PetMove';

do $$
declare
  v_user_id uuid;
  v_org_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  select id into v_user_id from auth.users where email = 'petmove@naver.com' limit 1;
  if v_user_id is null then
    raise notice 'petmove@naver.com 유저 없음 — 시드 스킵';
    return;
  end if;

  insert into public.memberships (user_id, org_id, role)
  values (v_user_id, v_org_id, 'owner')
  on conflict (user_id, org_id) do update set role = 'owner';
end $$;
