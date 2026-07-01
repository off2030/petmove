-- 남아프리카공화국 케이스: 자동 채움 규칙 seed.
--
-- 자동화규칙(사용자 스펙):
--   출국일 → 전염병검사일 = 출국 29일 전 (offset -29). ARC-OVI lab 자동 매핑.
--   출국일 → 심장사상충   = 출국 29일 전 (offset -29).
--   내원일 → 심장사상충   = 내원일 당일 (offset 0).
-- 심장사상충은 두 트리거(출국일·내원일) 모두 seed — 먼저 입력된 날짜 기준으로 채워지고
-- overwrite_existing=false 라 이후 트리거는 기존 값을 덮어쓰지 않음.
--
-- 모든 org 에 등록 (SaaS-wide, 싱가포르 시드와 동일 패턴).
-- idempotent: 이미 동일 규칙이 있는 org 는 스킵.

-- 1) 출국일 → 전염병검사(ARC-OVI) 출국 29일 전
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'south_africa', 'dog', 'departure_date', 'infectious_disease_records',
  array[-29], false, true, 100
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'south_africa'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'infectious_disease_records'
);

-- 2) 출국일 → 심장사상충 출국 29일 전
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'south_africa', 'all', 'departure_date', 'heartworm_dates',
  array[-29], false, true, 101
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'south_africa'
    and r.trigger_field = 'departure_date'
    and r.target_field = 'heartworm_dates'
);

-- 3) 내원일 → 심장사상충 당일
insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id, 'south_africa', 'all', 'vet_visit_date', 'heartworm_dates',
  array[0], false, true, 102
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'south_africa'
    and r.trigger_field = 'vet_visit_date'
    and r.target_field = 'heartworm_dates'
);

notify pgrst, 'reload schema';
