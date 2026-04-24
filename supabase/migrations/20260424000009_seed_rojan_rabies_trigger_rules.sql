-- 로잔 추가 자동 채움 규칙: 광견병 1차 입력 시 다른 백신 1차를 같은 날로 자동 입력.
-- 호주/뉴질랜드 강아지: 종합백신 + 켄넬코프 + CIV
-- 호주/뉴질랜드 고양이: 종합백신

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- 호주 강아지
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 10),
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 11),
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'civ_dates[0]', array[0], 12),
    -- 호주 고양이
    (rojan, 'australia', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 20),
    -- 뉴질랜드 강아지
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 10),
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 11),
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'civ_dates[0]', array[0], 12),
    -- 뉴질랜드 고양이
    (rojan, 'new_zealand', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 20);
end $$;
