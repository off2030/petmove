-- =============================================================================
-- Seed: platform-default field definitions (org_id = null)
-- These mirror the 구글폼 sheet columns, minus the 6 that became regular columns:
--   마이크로칩번호 -> cases.microchip
--   성함          -> cases.customer_name
--   영문성함       -> cases.customer_name_en
--   동물이름       -> cases.pet_name
--   동물이름(영문) -> cases.pet_name_en
--   어느 나라로    -> cases.destination
-- (Timestamp is handled by cases.created_at automatically.)
-- =============================================================================

insert into field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
values
  -- ───────────────────── 기본정보 (연락처·주소) ─────────────────────
  (null, 'phone',            '휴대폰 번호',  'text',     '기본정보', 10, null, null, false, true),
  (null, 'email',            '이메일',       'text',     '기본정보', 11, null, null, false, true),
  (null, 'address_kr',       '국내 주소',    'text',     '기본정보', 12, null, null, false, true),
  (null, 'address_en',       '영문 주소',    'text',     '기본정보', 13, null, null, false, true),
  (null, 'address_overseas', '해외 주소',    'text',     '기본정보', 14, null, null, false, true),

  -- ───────────────────── 동물정보 ─────────────────────
  (null, 'birth_date', '생년월일',     'date',   '동물정보', 20, null, null, false, true),
  (null, 'age',        '나이',         'text',   '동물정보', 21, null, null, false, true),
  (null, 'species',    '종',           'select', '동물정보', 22,
    '[{"value":"dog","label_ko":"개","label_en":"Dog"},
      {"value":"cat","label_ko":"고양이","label_en":"Cat"}]'::jsonb,
    null, false, true),
  (null, 'breed',      '품종',         'text',   '동물정보', 23, null, null, false, true),
  (null, 'breed_en',   '품종(영문)',   'text',   '동물정보', 24, null, null, false, true),
  (null, 'sex',        '성별',         'select', '동물정보', 25,
    '[{"value":"male",          "label_ko":"수컷",          "label_en":"Male"},
      {"value":"female",        "label_ko":"암컷",          "label_en":"Female"},
      {"value":"neutered_male", "label_ko":"중성화 수컷",   "label_en":"Neutered male"},
      {"value":"spayed_female", "label_ko":"중성화 암컷",   "label_en":"Spayed female"}]'::jsonb,
    null, false, true),
  (null, 'sex_en',     '성별(영문)',   'text',   '동물정보', 26, null, null, false, true),
  (null, 'color',      '모색',         'text',   '동물정보', 27, null, null, false, true),
  (null, 'color_en',   '모색(영문)',   'text',   '동물정보', 28, null, null, false, true),
  (null, 'weight',     '몸무게(kg)',   'number', '동물정보', 29, null, null, false, true),

  -- ───────────────────── 절차/식별 (is_step) ─────────────────────
  (null, 'microchip_check_date', '마이크로칩 확인일', 'date', '절차/식별', 30, null, null, true, true),

  -- ───────────────────── 절차/예방접종 (is_step) ─────────────────────
  (null, 'rabies_1',      '광견병 1차',        'date', '절차/예방접종', 40, null, null, true, true),
  (null, 'rabies_2',      '광견병 2차',        'date', '절차/예방접종', 41, null, null, true, true),
  (null, 'rabies_3',      '광견병 3차',        'date', '절차/예방접종', 42, null, null, true, true),
  (null, 'comprehensive', '종합백신',          'date', '절차/예방접종', 43, null, null, true, true),
  (null, 'civ',           'CIV',               'date', '절차/예방접종', 44, null, null, true, true),

  -- ───────────────────── 절차/검사 (is_step) ─────────────────────
  (null, 'rabies_titer_date',  '광견병 항체가 검사일', 'date', '절차/검사', 50, null, null, true,  true),
  (null, 'rabies_titer_value', '광견병 항체가 수치',   'text', '절차/검사', 51, null, null, false, true),
  (null, 'heartworm',          '심장사상충 검사',      'date', '절차/검사', 52, null, null, true,  true),
  (null, 'infectious_disease', '전염병 검사',          'date', '절차/검사', 53, null, null, true,  true),

  -- ───────────────────── 절차/구충 (is_step) ─────────────────────
  (null, 'external_parasite_1', '외부구충 1차', 'date', '절차/구충', 60, null, null, true, true),
  (null, 'external_parasite_2', '외부구충 2차', 'date', '절차/구충', 61, null, null, true, true),
  (null, 'external_parasite_3', '외부구충 3차', 'date', '절차/구충', 62, null, null, true, true),
  (null, 'internal_parasite_1', '내부구충 1차', 'date', '절차/구충', 63, null, null, true, true),
  (null, 'internal_parasite_2', '내부구충 2차', 'date', '절차/구충', 64, null, null, true, true),

  -- ───────────────────── 메모 ─────────────────────
  (null, 'memo_1', '메모 1', 'longtext', '메모', 90, null, null, false, true),
  (null, 'memo_2', '메모 2', 'longtext', '메모', 91, null, null, false, true),
  (null, 'memo_3', '메모 3', 'longtext', '메모', 92, null, null, false, true)

on conflict (org_id, key) do nothing;
