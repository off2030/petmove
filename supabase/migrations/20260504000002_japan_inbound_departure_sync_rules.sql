-- 일본 케이스: 입국 항공편 날짜 ↔ 출국일 자동 동기화 규칙 seed.
--
-- 기존에는 japan-extra-field 컴포넌트 안에서 하드코딩으로 동기화했으나,
-- 자동화 규칙으로 이관. 양방향 동기화를 위해 규칙 두 개를 등록.
--
-- overwrite_existing = true: 두 값이 항상 같도록 유지 (기존 값 무시).
--
-- idempotent: 이미 등록된 규칙은 스킵.

insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id,
  'japan',
  'all',
  'departure_date',
  'japan_extra.inbound.date',
  array[0],
  true,
  true,
  900
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'japan_extra.inbound.date'
);

insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id,
  'japan',
  'all',
  'japan_extra.inbound.date',
  'departure_date',
  array[0],
  true,
  true,
  901
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'japan'
    and r.trigger_field = 'japan_extra.inbound.date'
    and r.target_field = 'departure_date'
);

notify pgrst, 'reload schema';
