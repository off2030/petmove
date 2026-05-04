-- 일본 케이스 동기화 규칙 수정 (이전 마이그레이션 20260504000002 의 잘못된 target/trigger 정정).
--
-- 배경:
--  - 통합 리팩터로 모든 destination 의 추가정보가 top-level 키 (예: data.entry_date) 로 이전됨.
--  - SimpleExtraSection 이 EditableField 로 entry_date 키를 직접 read/write.
--  - 그런데 이전 마이그레이션은 legacy nested 경로 'japan_extra.inbound.date' 를 target/trigger 로 사용 →
--    삭제·수정이 실제로 화면에 반영되지 않는 구조적 불일치.
--
-- 이 마이그레이션:
--  1) 잘못된 rule 두 개 삭제
--  2) entry_date 기준 새 rule 두 개 등록 (양방향, overwrite=true)
--  3) 기존 케이스 데이터 마이그레이션: japan_extra.inbound.date → entry_date (entry_date 비어있을 때만)
--  4) 정리: japan_extra.inbound.date 비우기 (entry_date 로 옮긴 후) + 잘못 저장된 flat key 제거
--
-- idempotent.

-- 1) 잘못된 rule 삭제
delete from public.org_auto_fill_rules
where destination_key = 'japan'
  and (
    target_field = 'japan_extra.inbound.date'
    or trigger_field = 'japan_extra.inbound.date'
  );

-- 2) entry_date 기준 새 rule 등록 (idempotent)
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'japan', 'all',
  'departure_date', 'entry_date',
  array[0], true, true, 900
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'entry_date'
);

insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'japan', 'all',
  'entry_date', 'departure_date',
  array[0], true, true, 901
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'entry_date'
    and r.target_field = 'departure_date'
);

-- 3) 데이터 마이그레이션: legacy japan_extra.inbound.date → entry_date
--    entry_date 가 비어있고 japan_extra.inbound.date 가 있는 케이스만 대상.
update public.cases
set data = jsonb_set(
  data,
  '{entry_date}',
  data->'japan_extra'->'inbound'->'date'
)
where data->'japan_extra'->'inbound' ? 'date'
  and data->'japan_extra'->'inbound'->>'date' is not null
  and data->'japan_extra'->'inbound'->>'date' <> ''
  and (data->>'entry_date' is null or data->>'entry_date' = '');

-- 4a) 정리: japan_extra.inbound.date 제거 (entry_date 가 이제 source-of-truth).
--     단, japan_extra.inbound 의 다른 필드 (departure_airport 등) 는 보존.
update public.cases
set data = jsonb_set(
  data,
  '{japan_extra,inbound}',
  (data->'japan_extra'->'inbound') - 'date'
)
where data->'japan_extra'->'inbound' ? 'date';

-- 4b) 정리: 잘못된 flat key (점 포함된 literal string key) 제거.
--     이전 broken 엔진이 nested write 대신 flat key 로 저장한 garbage.
update public.cases
set data = data - 'japan_extra.inbound.date'
where data ? 'japan_extra.inbound.date';

notify pgrst, 'reload schema';
