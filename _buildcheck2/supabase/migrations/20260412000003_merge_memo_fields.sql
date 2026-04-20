-- =============================================================================
-- Merge memo_1 / memo_2 / memo_3 into a single unified "memo" field.
-- Safe now because cases table is empty; during xlsx import we will
-- concatenate the three original columns into this one key.
-- =============================================================================

-- 1) Add the unified memo field
insert into field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
values
  (null, 'memo', '메모', 'longtext', '메모', 90, null, null, false, true)
on conflict (org_id, key) do nothing;

-- 2) Remove the old split memo fields (no case data exists yet)
delete from field_definitions
where org_id is null
  and key in ('memo_1', 'memo_2', 'memo_3');
