-- comprehensive_2 비활성화.
-- 20260503000006 에서 종합백신 2차 단일 필드를 추가했지만, 케이스 상세는 실제로
-- general_vaccine_dates 배열을 쓰고 있음 (광견병/CIV 와 동일 패턴).
-- → 단일 _2 필드는 불필요. share dialog 도 array 패턴으로 통일.

update field_definitions
  set is_active = false
  where org_id is null and key = 'comprehensive_2';
