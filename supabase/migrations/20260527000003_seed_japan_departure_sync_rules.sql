-- 일본 출국 항공편 출발일 ↔ 출국일 양방향 sync 자동채움 룰 시드.
--
-- 배경:
--  - 20260504000002 에서 `japan_extra.inbound.date` ↔ `departure_date` 양방향 룰을 등록했음
--    (legacy nested path 시절). 이번에 일본 출국 항공편 그룹의 출발일을 top-level 신규 키
--    `departure_flight_date` 로 신설 (d73c2a8). 동기화 대상도 새 키로 갱신.
--  - 추가로 d73c2a8 의 cases.ts hardcode sync 는 본 룰로 대체 (admin updateCaseField 가
--    applyAutoFillRules 호출 시 자동 적용).
--  - portal share-links.ts 의 hardcode 는 룰 시스템 접근 못 해 유지 (별도 작업으로 정리).
--
-- 정책:
--  1) legacy 룰 (japan_extra.inbound.date 사용) 비활성화 — enabled=false. 데이터 보존하되 동작 정지.
--  2) 새 룰 두 개 등록 — departure_flight_date ↔ departure_date 양방향, overwrite=true.
--     auto-fill-engine 의 cur===newDate noop 체크로 무한 루프 차단.
--  3) idempotent — 같은 (org, destination, trigger, target) 이미 있으면 skip.

-- 1) Legacy 비활성화.
update public.org_auto_fill_rules
set enabled = false
where destination_key = 'japan'
  and (
    (trigger_field = 'japan_extra.inbound.date' and target_field = 'departure_date')
    or (trigger_field = 'departure_date' and target_field = 'japan_extra.inbound.date')
  )
  and enabled = true;

-- 2) 새 룰: departure_flight_date → departure_date
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'japan', 'all', 'departure_flight_date', 'departure_date',
  array[0], true, true, 900
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'departure_flight_date'
    and r.target_field = 'departure_date'
);

-- 3) 새 룰: departure_date → departure_flight_date
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'japan', 'all', 'departure_date', 'departure_flight_date',
  array[0], true, true, 901
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'departure_flight_date'
);

notify pgrst, 'reload schema';
