-- departure_date 만 채워진 일본 케이스의 data.entry_date backfill.
--
-- 배경:
--  - 일본 케이스 불변식: data.entry_date === departure_date 컬럼 (입국일 = 출국일).
--  - 정방향(entry_date → departure_date)은 포털 항공권 step·매직링크에서 동기화되지만,
--    역방향(departure_date → entry_date)은 코드 경로 어디서도 안 됐음 — 어드민
--    auto-fill rule 만 처리(어드민이 필드를 편집할 때만 발동). 어드민 케이스 생성
--    (createCaseWithData)·포털 케이스정보 편집(updateCaseInfoFields)으로 departure_date
--    가 들어가면 entry_date 가 빈 채로 남는다.
--  - 같은 커밋에서 위 두 경로에 역방향 동기화를 추가. 이 마이그레이션은 그 전에
--    desync 된 기존 케이스를 1회성으로 정리한다.
--  - 20260521000001 (entry_date → departure_date backfill) 의 거울상.
--
-- 정책 (보수적):
--  1) destination 토큰에 일본('일본'/'japan')이 포함된 케이스만 — 불변식은 일본 한정.
--     entry_date 는 스위스·태국·미국 등도 쓰지만 거기선 입국일 != 출국일이라 제외.
--  2) departure_date 가 있고 data.entry_date 가 비어있는(NULL 또는 '') 케이스만 채움.
--  3) 둘 다 있는데 서로 다른 경우는 손대지 않음 — 사람이 확인해야 할 신호.
--
-- idempotent — 다시 실행해도 entry_date 가 빈 케이스에만 영향.

do $$
declare
  affected int;
  mismatched int;
begin
  -- 1) 일본 케이스 중 entry_date 가 빈 것을 departure_date 로 채움.
  with src as (
    select id, departure_date
    from public.cases c
    where departure_date is not null
      and (data->>'entry_date' is null or data->>'entry_date' = '')
      and exists (
        select 1
        from unnest(string_to_array(lower(c.destination), ',')) as tok
        where btrim(tok) in ('일본', 'japan')
      )
  )
  update public.cases c
  set data = jsonb_set(
    coalesce(c.data, '{}'::jsonb),
    '{entry_date}',
    to_jsonb(src.departure_date::text)
  )
  from src
  where c.id = src.id;
  get diagnostics affected = row_count;
  raise notice 'backfilled entry_date for % japan cases', affected;

  -- 2) 진단: 일본 케이스 중 entry_date 와 departure_date 가 모두 있는데 다른 경우.
  --    이 마이그레이션은 손대지 않음 — 사람이 확인해야 할 신호.
  select count(*) into mismatched
  from public.cases c
  where departure_date is not null
    and data->>'entry_date' ~ '^\d{4}-\d{2}-\d{2}$'
    and (data->>'entry_date')::date <> departure_date
    and exists (
      select 1
      from unnest(string_to_array(lower(c.destination), ',')) as tok
      where btrim(tok) in ('일본', 'japan')
    );
  if mismatched > 0 then
    raise notice 'WARN: % japan cases have entry_date <> departure_date — review manually', mismatched;
  end if;
end $$;

notify pgrst, 'reload schema';
