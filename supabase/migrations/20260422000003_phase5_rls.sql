-- Phase 5: RLS 활성화 + 정책 작성.
-- 단일 org 전제. super_admin 은 전 org 접근. 공개 /apply 엔드포인트는 anon INSERT 허용 (로잔 한정).
-- 롤백: 20260422000003_phase5_rls_rollback.sql 참조.

-- ─────────────────────────────────────────────────
-- 헬퍼 함수
-- ─────────────────────────────────────────────────

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.memberships
    where user_id = auth.uid() and org_id = p_org_id
  )
$$;

-- ─────────────────────────────────────────────────
-- cases
-- ─────────────────────────────────────────────────

alter table public.cases enable row level security;

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases
  for insert with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update using (public.is_org_member(org_id) or public.is_super_admin())
  with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists cases_delete on public.cases;
create policy cases_delete on public.cases
  for delete using (public.is_org_member(org_id) or public.is_super_admin());

-- 공개 /apply 플로우: anon 으로부터 로잔 org 에만 INSERT 허용
drop policy if exists cases_anon_apply on public.cases;
create policy cases_anon_apply on public.cases
  for insert to anon
  with check (org_id = '00000000-0000-0000-0000-000000000001');

-- ─────────────────────────────────────────────────
-- case_history
-- ─────────────────────────────────────────────────

alter table public.case_history enable row level security;

drop policy if exists case_history_select on public.case_history;
create policy case_history_select on public.case_history
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_history_insert on public.case_history;
create policy case_history_insert on public.case_history
  for insert with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_history_update on public.case_history;
create policy case_history_update on public.case_history
  for update using (public.is_org_member(org_id) or public.is_super_admin())
  with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_history_delete on public.case_history;
create policy case_history_delete on public.case_history
  for delete using (public.is_org_member(org_id) or public.is_super_admin());

-- ─────────────────────────────────────────────────
-- field_definitions (org_id NULL = 플랫폼 공용)
-- ─────────────────────────────────────────────────

alter table public.field_definitions enable row level security;

drop policy if exists field_definitions_select on public.field_definitions;
create policy field_definitions_select on public.field_definitions
  for select using (
    org_id is null
    or public.is_org_member(org_id)
    or public.is_super_admin()
  );

drop policy if exists field_definitions_write on public.field_definitions;
create policy field_definitions_write on public.field_definitions
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- organizations
-- ─────────────────────────────────────────────────

alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (public.is_org_member(id) or public.is_super_admin());

drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- memberships
-- ─────────────────────────────────────────────────

alter table public.memberships enable row level security;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- calculator_items (플랫폼 공용 — authenticated 읽기 허용)
-- ─────────────────────────────────────────────────
-- 이미 RLS on 상태지만 policy 추가.

drop policy if exists calculator_items_select on public.calculator_items;
create policy calculator_items_select on public.calculator_items
  for select to authenticated using (true);

drop policy if exists calculator_items_write on public.calculator_items;
create policy calculator_items_write on public.calculator_items
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- app_settings (글로벌 설정, Phase 7 에서 org 별 분리 예정)
-- ─────────────────────────────────────────────────

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all using (public.is_super_admin())
  with check (public.is_super_admin());
