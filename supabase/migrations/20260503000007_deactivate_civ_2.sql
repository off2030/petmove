-- civ_2 비활성화.
-- 직전 마이그레이션(20260503000006)에서 civ_2 를 별도 단일 필드로 추가했지만,
-- CIV 는 이미 case detail 에서 civ_dates 배열로 관리되므로 별도 _2 필드는 중복.
-- (종합백신 comprehensive_2 는 유지 — comprehensive 가 단일 필드이고 array 가 아니라 1차/2차 분리 필요.)

update field_definitions
  set is_active = false
  where org_id is null and key = 'civ_2';
