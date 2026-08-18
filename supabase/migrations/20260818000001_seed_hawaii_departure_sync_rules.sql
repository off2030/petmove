-- 하와이 출국 항공편 출발일 ↔ 출국일 양방향 sync 자동채움 룰 시드.
--
-- 배경:
--  - departure_flight_date(추가정보 '출국 항공편' 출발일)는 japan·hawaii 두 목적지만 쓴다
--    (destination-config extraFields). 그런데 sync 룰은 20260527000003 에서 **일본만**
--    시드돼 있었다. 그래서 하와이는 항공편 출발일을 넣어도 cases.departure_date 컬럼이
--    빈 채로 남아 ① 상세 '출국일' 칸이 계속 비고 ② 출국일을 보는 화면(신고 탭 자동 포함,
--    목록 정렬·필터, 마감 계산)에서 그 케이스가 통째로 빠졌다 (2026-08-18 사용자 보고).
--  - 일본 룰과 같은 모양으로 하와이도 등록해 두 목적지 동작을 맞춘다.
--
-- 정책(일본 시드와 동일):
--  - departure_flight_date ↔ departure_date 양방향, overwrite=true.
--    auto-fill-engine 의 cur===newDate noop 체크로 무한 루프 차단.
--  - idempotent — 같은 (org, destination, trigger, target) 이 이미 있으면 skip.
--  - 기존 케이스는 소급 적용되지 않는다(룰은 저장 시점에 돈다). 이미 만들어진 하와이
--    케이스는 출국일 또는 항공편 출발일을 한 번 다시 저장하면 채워진다.

-- 1) departure_flight_date → departure_date
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'hawaii', 'all', 'departure_flight_date', 'departure_date',
  array[0], true, true, 902
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'hawaii'
    and r.trigger_field = 'departure_flight_date'
    and r.target_field = 'departure_date'
);

-- 2) departure_date → departure_flight_date
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'hawaii', 'all', 'departure_date', 'departure_flight_date',
  array[0], true, true, 903
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'hawaii'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'departure_flight_date'
);

notify pgrst, 'reload schema';
