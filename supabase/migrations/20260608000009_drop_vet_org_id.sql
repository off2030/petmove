-- =============================================================================
-- 9단계 — vet_org_id 컬럼 제거. (9/9단계)
-- docs/org-model-refactor.md
--
-- 담당 동물병원은 org_id 로 일원화됐다(3단계: vet_org_id→org_id 백필 + RLS 에서
-- vet_org_id 제거, 5단계: 코드 org_id 전환, 8단계: 타입·주석 제거 — 타입체크 통과로
-- 무참조 확인). co_progress 트리거(20260608000008)도 vet_org_id 컬럼을 참조하지 않는다.
-- 어제 추가됐던 중복 빈 컬럼 vet_org_id 를 제거한다. transport_org_id 는 유지.
--
-- 사용자 명시 승인(9단계 진행) 후 적용. vet_org_id 데이터는 이미 org_id 로 흡수돼
-- 정보 손실 없음.
-- =============================================================================

drop index if exists public.cases_vet_org_idx;

alter table public.cases drop column if exists vet_org_id;

notify pgrst, 'reload schema';
