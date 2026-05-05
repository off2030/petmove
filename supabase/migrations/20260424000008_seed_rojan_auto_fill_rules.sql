-- 로잔동물의료센터 기본 자동 채움 규칙 seed.
-- 이미 룰이 있으면 (사용자가 수동으로 추가) skip — idempotent.

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from public.org_auto_fill_rules where org_id = rojan) then
    insert into public.org_auto_fill_rules
      (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
    values
      -- 하와이: 내원일 → 내/외부 구충 (당일)
      (rojan, 'hawaii', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
      (rojan, 'hawaii', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
      -- 호주: 출국일 → 내원일(-2); 강아지 내원일 → 구충 (당일, -29); 고양이 내원일 → 구충 (당일, -21)
      (rojan, 'australia', 'all', 'departure_date', 'vet_visit_date', array[-2], 1),
      (rojan, 'australia', 'dog', 'vet_visit_date', 'internal_parasite_dates', array[0, -29], 2),
      (rojan, 'australia', 'dog', 'vet_visit_date', 'external_parasite_dates', array[0, -29], 3),
      (rojan, 'australia', 'cat', 'vet_visit_date', 'internal_parasite_dates', array[0, -21], 5),
      (rojan, 'australia', 'cat', 'vet_visit_date', 'external_parasite_dates', array[0, -21], 6),
      -- 호주 강아지: CIV 1차 → 2차(+14)
      (rojan, 'australia', 'dog', 'civ_dates[0]', 'civ_dates[1]', array[14], 4),
      -- 뉴질랜드: 출국일 → 내원일(-2); 내원일 → 구충·심장사상충 (당일, -29)
      (rojan, 'new_zealand', 'all', 'departure_date', 'vet_visit_date', array[-2], 1),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0, -29], 2),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'external_parasite_dates', array[0, -29], 3),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'heartworm_dates', array[0, -29], 4);
  end if;
end $$;
