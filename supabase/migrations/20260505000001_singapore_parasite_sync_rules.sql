-- 싱가포르 케이스: 내원일 → 내·외부구충 자동 채움 규칙 seed.
--
-- 모든 org 에 등록 (SaaS-wide). 기존 rojan 전용 시드(20260424000011)는
-- 단일-tenant 단계의 잔재이므로, 신규 org 도 동일 규칙을 받도록 broadcast.
--
-- idempotent: 이미 동일 규칙이 있는 org 는 스킵.

insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id,
  'singapore',
  'all',
  'vet_visit_date',
  'internal_parasite_dates',
  array[0],
  false,
  true,
  100
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'singapore'
    and r.trigger_field = 'vet_visit_date'
    and r.target_field = 'internal_parasite_dates'
);

insert into public.org_auto_fill_rules
  (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
select
  o.id,
  'singapore',
  'all',
  'vet_visit_date',
  'external_parasite_dates',
  array[0],
  false,
  true,
  101
from public.organizations o
where not exists (
  select 1 from public.org_auto_fill_rules r
  where r.org_id = o.id
    and r.destination_key = 'singapore'
    and r.trigger_field = 'vet_visit_date'
    and r.target_field = 'external_parasite_dates'
);

notify pgrst, 'reload schema';
