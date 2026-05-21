-- 매직링크로 항공권만 채워진 케이스의 departure_date 컬럼 backfill.
--
-- 배경:
--  - submitShareLink (apps/portal/lib/actions/share-links.ts) 가 보호자 매직링크 제출 시
--    data.entry_date 만 쓰고 departure_date 컬럼 동기화 누락 → 76968a4 에서 코드 수정.
--  - 그 전까지 매직링크로만 채워진 케이스들은 data.entry_date 가 있어도
--    departure_date 컬럼은 비어있음. 이 마이그레이션이 1회성으로 그 상태를 정리.
--
-- 정책 (보수적):
--  1) data.entry_date 가 YYYY-MM-DD 형식인 케이스만 대상.
--  2) departure_date 가 NULL 인 경우만 채움. 이미 값이 있는데 entry_date 와 다른 경우는
--     사용자가 의도적으로 다르게 적었을 수 있어 손대지 않음 (사람이 확인).
--     entry_date===departure_date invariant 는 admin 의 auto-fill rule 상 일본 한정이고,
--     journey step / admin 의 정상 입력 경로는 이미 동기화됨.
--
-- idempotent — 다시 실행해도 NULL 인 케이스에만 영향.

do $$
declare
  affected int;
  mismatched int;
begin
  -- 1) NULL 인 departure_date 를 entry_date 로 채움.
  with src as (
    select id, (data->>'entry_date')::date as ed
    from public.cases
    where departure_date is null
      and data->>'entry_date' ~ '^\d{4}-\d{2}-\d{2}$'
  )
  update public.cases c
  set departure_date = src.ed
  from src
  where c.id = src.id;
  get diagnostics affected = row_count;
  raise notice 'backfilled departure_date for % cases', affected;

  -- 2) 진단: entry_date 와 departure_date 가 모두 있는데 서로 다른 케이스 수.
  --    이 마이그레이션은 손대지 않음 — 사람이 확인해야 할 신호.
  select count(*) into mismatched
  from public.cases
  where data->>'entry_date' ~ '^\d{4}-\d{2}-\d{2}$'
    and departure_date is not null
    and (data->>'entry_date')::date <> departure_date;
  if mismatched > 0 then
    raise notice 'WARN: % cases have entry_date <> departure_date — review manually', mismatched;
  end if;
end $$;
