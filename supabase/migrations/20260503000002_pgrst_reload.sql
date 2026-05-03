-- PostgREST 스키마 캐시 강제 리로드.
-- 직전 마이그레이션(20260503000001)에서 추가한 cases.assigned_to / case_transfers 가
-- 일부 환경에서 PostgREST 캐시에 즉시 반영 안 되는 케이스 대응.
notify pgrst, 'reload schema';
