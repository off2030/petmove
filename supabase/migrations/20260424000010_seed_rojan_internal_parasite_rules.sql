-- 로잔: 영국·아일랜드·몰타·노르웨이·핀란드 — 내원일 → 내부구충 같은 날.
-- 영국은 config key 'uk' 사용. 나머지 4개는 Korean 이름을 destination_key 로 저장
-- (apply engine 에서 config key 가 아닐 경우 case.destination substring match 로 폴백).

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    (rojan, 'uk', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '아일랜드', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '몰타', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '노르웨이', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '핀란드', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1);
end $$;
