-- 호주 고양이 구충 자동화 분리.
-- 기존 호주 공통(all) 구충 규칙은 강아지 전용(dog, 당일/-29일)으로 좁히고,
-- 고양이 전용(cat, 당일/-21일) 규칙을 추가한다.

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  update public.org_auto_fill_rules
  set species_filter = 'dog',
      updated_at = now()
  where org_id = rojan
    and destination_key = 'australia'
    and species_filter = 'all'
    and trigger_field = 'vet_visit_date'
    and target_field in ('internal_parasite_dates', 'external_parasite_dates')
    and offsets_days = array[0, -29];

  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  select rojan, 'australia', 'cat', 'vet_visit_date', 'internal_parasite_dates', array[0, -21], 5
  where not exists (
    select 1 from public.org_auto_fill_rules r
    where r.org_id = rojan
      and r.destination_key = 'australia'
      and r.species_filter = 'cat'
      and r.trigger_field = 'vet_visit_date'
      and r.target_field = 'internal_parasite_dates'
  );

  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  select rojan, 'australia', 'cat', 'vet_visit_date', 'external_parasite_dates', array[0, -21], 6
  where not exists (
    select 1 from public.org_auto_fill_rules r
    where r.org_id = rojan
      and r.destination_key = 'australia'
      and r.species_filter = 'cat'
      and r.trigger_field = 'vet_visit_date'
      and r.target_field = 'external_parasite_dates'
  );
end $$;
