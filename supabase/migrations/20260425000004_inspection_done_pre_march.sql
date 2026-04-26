-- 검사 탭의 2026-03-01 이전 항목들을 일괄 완료(done) 처리.
-- 검사 탭은 다음 행들을 표시하며, 어느 하나라도 검사일이 2026-03-01 미만이면 해당 케이스를 done 으로.
--   1) 광견병항체: data.rabies_titer_records[0].date  (legacy: data.rabies_titer_test_date)
--   2) 호주 전염병검사: data.infectious_disease_records 의 lab='ksvdl' 의 date
--   3) 뉴질랜드 전염병검사: data.infectious_disease_records 의 lab IN ('apqa_hq','vbddl') 의 date
--      (없으면 departure_date - 15일로 자동, 즉 departure_date < 2026-03-16 이면 자동 검사일이 3월 이전)
--
-- inspection_status 는 case 단위 필드라 한 케이스의 모든 검사 행이 함께 done 으로 분류됨.
-- 사용자가 다시 wait/testing 으로 되돌리면 정렬에서 다시 위로 올라옴.

update cases
set data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{inspection_status}',
      '"done"'::jsonb,
      true
    ),
    updated_at = now()
where deleted_at is null
  and coalesce(data->>'inspection_status', 'waiting') <> 'done'
  and (
    -- 1) titer date < 2026-03-01
    coalesce(
      data->'rabies_titer_records'->0->>'date',
      data->>'rabies_titer_test_date'
    ) < '2026-03-01'
    or
    -- 2) ksvdl 검사일 < 2026-03-01
    exists (
      select 1
      from jsonb_array_elements(coalesce(data->'infectious_disease_records', '[]'::jsonb)) as rec
      where rec->>'lab' = 'ksvdl' and rec->>'date' < '2026-03-01'
    )
    or
    -- 3) apqa_hq / vbddl 검사일 < 2026-03-01
    exists (
      select 1
      from jsonb_array_elements(coalesce(data->'infectious_disease_records', '[]'::jsonb)) as rec
      where rec->>'lab' in ('apqa_hq', 'vbddl') and rec->>'date' < '2026-03-01'
    )
    or
    -- 4) 뉴질랜드 자동 검사일(출국일-15) < 2026-03-01 → departure_date < 2026-03-16
    --    infectious 기록이 없을 때만 자동값을 사용하므로, 기록 존재 시는 위 3) 에서 처리됨.
    (
      destination like '%뉴질랜드%'
      and departure_date is not null
      and departure_date < date '2026-03-16'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(data->'infectious_disease_records', '[]'::jsonb)) as rec
        where rec->>'lab' in ('apqa_hq', 'vbddl')
      )
    )
  );
