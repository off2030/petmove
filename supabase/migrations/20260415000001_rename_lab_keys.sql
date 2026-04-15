-- =============================================================================
-- Rename lab keys inside cases.data to the unified naming scheme and split
-- the composite 'nvrqs_hq+vbddl' infectious-disease rows into two separate
-- rows (one per lab).
--
-- Key migrations:
--   komipharm      -> krsl
--   nvrqs_seoul    -> apqa_seoul
--   nvrqs_main     -> apqa_hq
--   nvrqs_hq       -> apqa_hq
--   ksu            -> ksvdl_r
--   nvrqs_hq+vbddl -> split into two rows: apqa_hq, vbddl (infectious only)
-- =============================================================================

-- 1. rabies_titer_records[].lab
update cases c
set data = jsonb_set(c.data, '{rabies_titer_records}', (
  select coalesce(jsonb_agg(
    case (elem->>'lab')
      when 'komipharm'   then jsonb_set(elem, '{lab}', '"krsl"')
      when 'nvrqs_seoul' then jsonb_set(elem, '{lab}', '"apqa_seoul"')
      when 'nvrqs_main'  then jsonb_set(elem, '{lab}', '"apqa_hq"')
      when 'ksu'         then jsonb_set(elem, '{lab}', '"ksvdl_r"')
      else elem
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(c.data->'rabies_titer_records') with ordinality as arr(elem, ord)
))
where jsonb_typeof(c.data->'rabies_titer_records') = 'array';

-- 2. infectious_disease_records[].lab (+ split composite key)
update cases c
set data = jsonb_set(c.data, '{infectious_disease_records}', (
  select coalesce(jsonb_agg(new_elem order by ord, sub_ord), '[]'::jsonb)
  from jsonb_array_elements(c.data->'infectious_disease_records') with ordinality as arr(elem, ord),
  lateral jsonb_array_elements(
    case (elem->>'lab')
      when 'nvrqs_hq+vbddl' then jsonb_build_array(
        jsonb_set(elem, '{lab}', '"apqa_hq"'),
        jsonb_set(elem, '{lab}', '"vbddl"')
      )
      when 'nvrqs_hq' then jsonb_build_array(jsonb_set(elem, '{lab}', '"apqa_hq"'))
      else jsonb_build_array(elem)
    end
  ) with ordinality as x(new_elem, sub_ord)
))
where jsonb_typeof(c.data->'infectious_disease_records') = 'array';

-- 3. inspection_lab (scalar used by the todos tab sort/display)
update cases
set data = jsonb_set(data, '{inspection_lab}',
  case data->>'inspection_lab'
    when 'komipharm'      then '"krsl"'::jsonb
    when 'nvrqs_seoul'    then '"apqa_seoul"'::jsonb
    when 'nvrqs_main'     then '"apqa_hq"'::jsonb
    when 'nvrqs_hq'       then '"apqa_hq"'::jsonb
    when 'ksu'            then '"ksvdl_r"'::jsonb
    when 'nvrqs_hq+vbddl' then '"apqa_hq"'::jsonb
    else data->'inspection_lab'
  end
)
where data ? 'inspection_lab'
  and data->>'inspection_lab' in (
    'komipharm', 'nvrqs_seoul', 'nvrqs_main', 'nvrqs_hq', 'ksu', 'nvrqs_hq+vbddl'
  );
