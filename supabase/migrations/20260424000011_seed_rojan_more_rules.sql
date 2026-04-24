-- 로잔 추가 자동 채움 규칙 (2차):
-- 필리핀, 싱가포르, 터키, 아랍에미리트, 브라질, 멕시코, 괌

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    -- 필리핀
    (rojan, 'philippines', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'philippines', 'all', 'rabies_dates[0]', 'internal_parasite_dates', array[0], 2),
    -- 싱가포르
    (rojan, 'singapore', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'singapore', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 2),
    (rojan, 'singapore', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 3),
    -- 터키
    (rojan, 'turkey', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'turkey', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 아랍에미리트
    (rojan, 'uae', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    -- 브라질
    (rojan, 'brazil', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'brazil', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 멕시코
    (rojan, 'mexico', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'mexico', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 괌 강아지: 광견병 → 종합백신 + 켄넬코프
    (rojan, 'guam', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'guam', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 2),
    -- 괌 고양이: 광견병 → 종합백신
    (rojan, 'guam', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 3),
    -- 괌 공통: 내원일 → 내외부구충 + 심장사상충
    (rojan, 'guam', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 10),
    (rojan, 'guam', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 11),
    (rojan, 'guam', 'all', 'vet_visit_date', 'heartworm_dates', array[0], 12);
end $$;
