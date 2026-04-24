-- 조직별 절차 검증 규칙 on/off 저장.
-- 행 존재 = 해당 org 에서 규칙 비활성화. 행 삭제 = 다시 활성화.
-- check_id 는 코드의 ProcedureCheck.id (예: 'jp.rabies-prime-after-91days-old') 를 그대로 저장.
-- 코드에서 규칙이 사라져도 row 는 남지만 검증 시 무시됨 — 깔끔하게 청소하려면 별도 쿼리 필요.

create table if not exists public.org_disabled_checks (
  org_id uuid not null references public.organizations(id) on delete cascade,
  check_id text not null,
  disabled_at timestamptz not null default now(),
  disabled_by uuid references auth.users(id) on delete set null,
  primary key (org_id, check_id)
);

create index if not exists org_disabled_checks_org_id_idx
  on public.org_disabled_checks (org_id);

-- ───── RLS ─────
alter table public.org_disabled_checks enable row level security;

-- SELECT: 모든 org 멤버. 케이스 검증 시 멤버가 disabled 목록을 읽어야 함.
drop policy if exists org_disabled_checks_select on public.org_disabled_checks;
create policy org_disabled_checks_select on public.org_disabled_checks
  for select using (public.is_org_member(org_id) or public.is_super_admin());

-- WRITE: admin 만. 멤버는 보기만 가능.
drop policy if exists org_disabled_checks_insert on public.org_disabled_checks;
create policy org_disabled_checks_insert on public.org_disabled_checks
  for insert with check (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists org_disabled_checks_delete on public.org_disabled_checks;
create policy org_disabled_checks_delete on public.org_disabled_checks
  for delete using (public.is_org_admin(org_id) or public.is_super_admin());
