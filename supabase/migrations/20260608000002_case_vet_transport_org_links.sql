-- =============================================================================
-- 담당 동물병원 / 운송업체 연결 — cases.vet_org_id / transport_org_id
-- =============================================================================
-- 보호자가 펫무브 [내 정보 > 담당 동물병원 · 운송업체] 카드에서 선택한 조직을
-- 본인 케이스에 일괄 적용 (보호자 단위 통일 정책).
--
-- 기존 cases.org_id 는 진입 조직(신청폼 발급처 또는 portal 직접 = platform) 의
-- 의미로 보존. 후속 연결은 별도 컬럼.
--
-- org_type='both' 조직은 양 카드에서 선택 가능 — 자동 적용은 X (명시 선택).
-- 한 케이스의 vet_org_id 와 transport_org_id 가 같은 UUID 일 수 있음.
-- on delete set null: 조직이 삭제되면 연결만 해제, 케이스는 보존.
--
-- RLS 확장:
--   SELECT — vet_org / transport_org 멤버도 케이스 읽기 가능 (작업에 필요)
--   UPDATE — 동일 (last-write-wins 받아들임, audit log 는 후속 단계)
--   DELETE — org_id 만 유지 (진입 조직만 삭제 가능, 연결 조직이 임의 삭제 차단)

alter table public.cases
  add column if not exists vet_org_id uuid references public.organizations(id) on delete set null,
  add column if not exists transport_org_id uuid references public.organizations(id) on delete set null;

create index if not exists cases_vet_org_idx
  on public.cases (vet_org_id) where vet_org_id is not null;
create index if not exists cases_transport_org_idx
  on public.cases (transport_org_id) where transport_org_id is not null;

comment on column public.cases.vet_org_id is
  '보호자가 [내 정보 > 담당 동물병원] 에서 선택한 조직. NULL = 미연결.';
comment on column public.cases.transport_org_id is
  '보호자가 [내 정보 > 운송업체] 에서 선택한 조직. NULL = 미연결.';

-- ─────────────────────────────────────────────────
-- RLS 확장 — SELECT / UPDATE 에 vet/transport 멤버 OR 절 추가
-- ─────────────────────────────────────────────────

-- SELECT: 진입 조직 + vet + transport 중 어느 한 곳의 멤버여도 읽기 가능
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select using (
    public.is_org_member(org_id)
    or public.is_org_member(vet_org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
    or exists (
      select 1 from public.case_customer_links l
      where l.case_id = cases.id and l.user_id = auth.uid()
    )
  );

-- UPDATE: 진입 + vet + transport 모두 수정 가능. v1 은 필드별 권한 분리 X
-- (last-write-wins). 충돌 추적은 audit log 별도 단계.
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update
  using (
    public.is_org_member(org_id)
    or public.is_org_member(vet_org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
  )
  with check (
    public.is_org_member(org_id)
    or public.is_org_member(vet_org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
  );

-- DELETE 는 그대로 — 진입 조직(org_id) 만 삭제. 연결된 vet/transport 가 임의로
-- 케이스를 지우지 못하게 안전선 유지.

notify pgrst, 'reload schema';
