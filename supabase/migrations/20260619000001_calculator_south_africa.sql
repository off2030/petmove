-- =============================================================================
-- 비용 계산기 — 남아프리카공화국(ARC-OVI) 항목 추가.
--   국가 드롭다운 맨 뒤에 오도록 country_order = 현재 최대값 + 1.
--   item_order 0~3. 전염병검사(ARC-OVI 발송 검사) 비용 900만원.
--   on conflict: 이미 동일 (country,item_name) 행이 있으면 건너뜀(재실행 안전).
-- =============================================================================

insert into calculator_items (country, item_name, cost, item_order, country_order)
select '남아프리카공화국', v.item_name, v.cost, v.item_order,
       (select coalesce(max(country_order), 0) + 1 from calculator_items)
from (values
  ('마이크로칩',            50000,    0),
  ('광견병',               25000,    1),
  ('전염병검사',           9000000,  2),
  ('출국 전 검진/증명서',   100000,   3)
) as v(item_name, cost, item_order)
on conflict (country, item_name) do nothing;
