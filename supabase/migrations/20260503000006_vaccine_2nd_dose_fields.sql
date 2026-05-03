-- 종합백신·CIV 2차 필드 추가.
-- 기존 comprehensive / civ 는 1차 단일 — 2차까지 입력받기 위한 _2 키 추가.
-- (rabies 처럼 dates 배열로 통합 가능하지만 종합·CIV 는 보통 1·2차 고정 → 단순 단일 필드로 분리.)
--
-- display_order 는 1차 직후로 (43.5, 44.5) — 정수 슬롯이 맞물려 +1 도 가능하지만
-- 향후 추가 백신 끼어들 여지 위해 소수 사용.

insert into field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
values
  (null, 'comprehensive_2', '종합백신 2차', 'date', '절차/예방접종', 44, null, null, true, true),
  (null, 'civ_2',           'CIV 2차',       'date', '절차/예방접종', 45, null, null, true, true)
on conflict (org_id, key) do nothing;

notify pgrst, 'reload schema';
