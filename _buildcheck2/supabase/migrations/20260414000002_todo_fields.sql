-- New field_definitions for todo page tabs
-- These fields are stored in cases.data jsonb

INSERT INTO field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
VALUES
  -- ── 검사 탭 ──
  (null, 'inspection_status', '검사 진행상태', 'select', '할일/검사', 100,
    '[{"value":"not_started","label_ko":"시작 전"},
      {"value":"in_progress","label_ko":"진행 중"},
      {"value":"done","label_ko":"완료"}]'::jsonb,
    null, false, true),
  (null, 'inspection_lab', '검사기관', 'text', '할일/검사', 101, null, null, false, true),
  (null, 'inspection_urgent', '긴급', 'select', '할일/검사', 102,
    '[{"value":"yes","label_ko":"Yes"},{"value":"no","label_ko":"No"}]'::jsonb,
    null, false, true),
  (null, 'inspection_memo', '검사 비고', 'text', '할일/검사', 103, null, null, false, true),

  -- ── 출국서류 탭 ──
  (null, 'export_doc_status', '서류 준비상태', 'select', '할일/출국서류', 110,
    '[{"value":"not_started","label_ko":"시작 전"},
      {"value":"in_progress","label_ko":"진행 중"},
      {"value":"done","label_ko":"완료"}]'::jsonb,
    null, false, true),
  (null, 'vet_visit_date', '내원일', 'date', '할일/출국서류', 111, null, null, false, true),
  (null, 'round_trip', '왕복/편도', 'select', '할일/출국서류', 112,
    '[{"value":"yes","label_ko":"왕복"},{"value":"no","label_ko":"편도"}]'::jsonb,
    null, false, true),
  (null, 'export_doc_memo', '서류 비고', 'text', '할일/출국서류', 113, null, null, false, true),

  -- ── 수입신고 탭 ──
  (null, 'import_export_status', '수출 상태', 'select', '할일/수입신고', 120,
    '[{"value":"not_started","label_ko":"시작 전"},
      {"value":"na","label_ko":"N/A"},
      {"value":"in_progress","label_ko":"진행 중"},
      {"value":"done","label_ko":"완료"}]'::jsonb,
    null, false, true),
  (null, 'import_import_status', '수입 상태', 'select', '할일/수입신고', 121,
    '[{"value":"not_started","label_ko":"시작 전"},
      {"value":"na","label_ko":"N/A"},
      {"value":"in_progress","label_ko":"진행 중"},
      {"value":"done","label_ko":"완료"}]'::jsonb,
    null, false, true),
  (null, 'return_date', '귀국일', 'date', '할일/수입신고', 122, null, null, false, true),
  (null, 'import_memo', '수입신고 비고', 'text', '할일/수입신고', 123, null, null, false, true)

ON CONFLICT (org_id, key) DO NOTHING;
