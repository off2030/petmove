-- =============================================================================
-- 3단계 — 담당 동물병원을 org_id 로 일원화 + RLS 가시성/삭제 재정렬. (3/9단계)
-- docs/org-model-refactor.md
--
-- (a) 백필: 어제(20260608000002) 추가한 vet_org_id(담당 병원)를 org_id 로 흡수한다.
--     org_id 가 곧 담당 동물병원. vet_org_id 가 설정돼 있고 org_id 와 다르면 org_id 를
--     그 담당으로 갱신 (예: 직영 org_id=platform + 고객이 담당 로잔 선택 → org_id=로잔).
--     ※ RLS 에서 vet_org_id 를 빼기 "전에" 흡수해야 vet 로만 보이던 케이스가 안 사라진다.
--
-- (b)(c) SELECT/UPDATE 정책에서 vet_org_id 제거 — org_id(병원)+transport_org_id(운송)+
--     본사+고객(case_customer_links) 기준.
-- (d) DELETE 정책에 transport_org_id 추가 — 운송업체도 삭제 가능 (기존 org_id 만 → 둘 다).
--
-- vet_org_id 컬럼 자체는 코드 참조 정리(8단계) 후 9단계에서 제거. 여기선 RLS 참조만 제거.
-- =============================================================================

-- (a) 담당 병원(vet_org_id) → org_id 흡수.
update public.cases
set org_id = vet_org_id
where vet_org_id is not null
  and vet_org_id <> org_id
  and deleted_at is null;

-- (b) SELECT — vet_org_id 제거.
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select using (
    public.is_org_member(org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
    or exists (
      select 1 from public.case_customer_links l
      where l.case_id = cases.id and l.user_id = auth.uid()
    )
  );

-- (c) UPDATE — vet_org_id 제거.
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update
  using (
    public.is_org_member(org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
  )
  with check (
    public.is_org_member(org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
  );

-- (d) DELETE — transport_org_id 추가 (운송업체도 삭제 가능).
drop policy if exists cases_delete on public.cases;
create policy cases_delete on public.cases
  for delete
  using (
    public.is_org_member(org_id)
    or public.is_org_member(transport_org_id)
    or public.is_super_admin()
  );

notify pgrst, 'reload schema';
