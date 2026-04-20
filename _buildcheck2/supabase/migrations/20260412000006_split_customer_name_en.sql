-- =============================================================================
-- Add separate last name / first name fields for customer English name.
-- The original customer_name_en column is kept as-is (hidden in UI).
-- New data stored in cases.data as 'customer_last_name_en' / 'customer_first_name_en'.
-- =============================================================================

insert into field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
values
  (null, 'customer_last_name_en',  '성 (영문)',  'text', '기본정보', 3, null, null, false, true),
  (null, 'customer_first_name_en', '이름 (영문)', 'text', '기본정보', 4, null, null, false, true)
on conflict (org_id, key) do nothing;
