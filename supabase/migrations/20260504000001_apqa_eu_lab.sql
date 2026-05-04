-- APQA EU 검사기관 신설에 따른 데이터 마이그레이션.
--  - inspection_config 의 EU/영국/스위스 titerRule 들을 apqa_hq → apqa_eu 로 교체
--  - 기존 케이스의 rabies_titer_records[*].lab 도 EU/영국/스위스 목적지면 apqa_hq → apqa_eu 로 교체
--    (검사 탭에서 EU 케이스가 'APQA HQ' 로 노출되던 문제 해결)
-- 호주/뉴질랜드 등 다른 룰의 apqa_hq 는 그대로 유지 (NZ infectious 묶음 등).

-- 1) inspection_config 의 titerRules 갱신
update public.organization_settings
set value = jsonb_set(
  value,
  '{titerRules}',
  (
    select coalesce(jsonb_agg(
      case
        when (rule->'countries') ?| array['독일','프랑스','이탈리아','스페인','네덜란드','벨기에','오스트리아','스웨덴','덴마크','핀란드','폴란드','체코','헝가리','포르투갈','그리스','루마니아','불가리아','크로아티아','슬로바키아','슬로베니아','리투아니아','라트비아','에스토니아','룩셈부르크','몰타','키프로스','아일랜드','스위스','영국']
        then jsonb_set(
          rule,
          '{labs}',
          (
            select coalesce(jsonb_agg(
              case when v::text = '"apqa_hq"' then to_jsonb('apqa_eu'::text) else v end
            ), '[]'::jsonb)
            from jsonb_array_elements(coalesce(rule->'labs', '[]'::jsonb)) as v
          )
        )
        else rule
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(value->'titerRules', '[]'::jsonb)) as rule
  )
)
where key = 'inspection_config'
  and value ? 'titerRules';

-- 2) 기존 케이스의 rabies_titer_records[*].lab 갱신 (EU/영국/스위스 destination 만)
-- destination 컬럼은 콤마 구분 가능 (다중 목적지). 목적지에 EU/UK/CH 가 하나라도 있으면 적용.
update public.cases c
set data = jsonb_set(
  data,
  '{rabies_titer_records}',
  (
    select coalesce(jsonb_agg(
      case
        when rec ? 'lab' and rec->>'lab' = 'apqa_hq'
        then jsonb_set(rec, '{lab}', '"apqa_eu"'::jsonb)
        else rec
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(data->'rabies_titer_records') as rec
  )
)
where data ? 'rabies_titer_records'
  and jsonb_typeof(data->'rabies_titer_records') = 'array'
  and exists (
    select 1
    from regexp_split_to_table(coalesce(c.destination, ''), '\s*,\s*') as d
    where trim(d) = any(array[
      '독일','프랑스','이탈리아','스페인','네덜란드','벨기에','오스트리아',
      '스웨덴','덴마크','핀란드','폴란드','체코','헝가리','포르투갈',
      '그리스','루마니아','불가리아','크로아티아','슬로바키아','슬로베니아',
      '리투아니아','라트비아','에스토니아','룩셈부르크','몰타','키프로스',
      '아일랜드','스위스','영국'
    ])
  );

notify pgrst, 'reload schema';
