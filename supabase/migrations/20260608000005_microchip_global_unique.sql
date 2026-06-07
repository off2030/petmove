-- =============================================================================
-- 마이크로칩 전역 unique — 조직 무관, 같은 칩은 전체에서 한 번만.
--
-- 기존 cases_org_microchip_unique = unique (org_id, microchip) where deleted_at is null
-- 는 조직 단위라, 서로 다른 조직이면 같은 동물(칩)이 중복 등록될 수 있었다. 새 조직
-- 연결 모델(docs/org-model-refactor.md — 담당 이동·정보 통합)에선 한 동물은 어디서나
-- 하나의 케이스여야 하므로 마이크로칩을 전역 unique 로 강화한다. 조직 단위 unique 는
-- 담당 병원 변경(org_id 이동) 시 새 병원에 같은 칩이 있으면 이동을 막는 부작용도 있다.
--
-- 보존: null(칩 미입력)은 distinct 라 여러 케이스 허용, 소프트삭제(deleted_at)는 인덱스
-- 에서 제외돼 재등록 허용 — 기존 동작 그대로. 보조 칩(microchip_extra)은 이번 범위 밖.
--
-- 순서: 새 인덱스를 먼저 생성(중복이 있으면 여기서 실패 → 기존 org 단위 인덱스가 보존됨)
-- 한 뒤, 성공했을 때만 옛 인덱스를 제거한다.
-- =============================================================================

create unique index if not exists cases_microchip_global_unique
  on public.cases (microchip)
  where deleted_at is null and microchip is not null;

drop index if exists public.cases_org_microchip_unique;
