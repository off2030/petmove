-- 20260425000004 보정: 한 케이스 안에 3월 이후 검사일이 하나라도 있으면 done 취소.
-- inspection_status 가 case 단위라, titer 만 오래되어도 미완료 infectious/NZ 행이 함께 사라지는 버그.
-- 직전 마이그(2026-04-25 14:00 UTC) 윈도우에 done 으로 바뀐 것 중 미완료 검사가 남은 행만 waiting 으로 되돌림.

update cases
set data = jsonb_set(data, '{inspection_status}', '"waiting"'::jsonb, true),
    updated_at = now()
where deleted_at is null
  and data->>'inspection_status' = 'done'
  and updated_at >= '2026-04-25 14:00:00+00'
  and updated_at <  '2026-04-25 15:00:00+00'
  and (
    -- titer 가 3월 이후
    coalesce(
      data->'rabies_titer_records'->0->>'date',
      data->>'rabies_titer_test_date'
    ) >= '2026-03-01'
    or
    -- 어떤 infectious record 든 3월 이후
    exists (
      select 1
      from jsonb_array_elements(coalesce(data->'infectious_disease_records', '[]'::jsonb)) as rec
      where rec->>'date' >= '2026-03-01'
    )
    or
    -- NZ 자동 검사일(출국일-15) 이 3월 이후 → 출국일 ≥ 2026-03-16, infectious 기록 없을 때만
    (
      destination like '%뉴질랜드%'
      and departure_date is not null
      and departure_date >= date '2026-03-16'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(data->'infectious_disease_records', '[]'::jsonb)) as rec
        where rec->>'lab' in ('apqa_hq', 'vbddl')
      )
    )
  );
