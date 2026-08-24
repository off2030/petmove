-- 면역 유효기간(valid_until) 표기 정규화 — "1 year"/"1Y"/"3Y" → "1년"/"3년".
--
-- 배경 (2026-08-24 황현선/루이):
--  - 접종증명서 AI 추출이 증명서에 인쇄된 표기를 그대로 넘겨 valid_until 에
--    "1 year"·"1 Year"·"1Y"·"3Y" 가 저장돼 있었다(전체 32건 중 8건).
--  - 읽는 쪽(resolveValidUntil)은 한글 "N년" 과 ISO 만 알아듣고 나머지는 원문을 그대로
--    반환했고, 그 값이 곧바로 문자열 비교에 쓰였다. `'2026-08-22' > '1 year'` 가 true 라
--    **1차 유효기간 안에 맞은 멀쩡한 2차 접종이 "유효기간 초과"로 경고**됐다.
--  - 읽는 쪽은 표기 흔들림을 전부 받아 주도록 고쳤고(같은 날 커밋), 추출 단계도 표준형으로
--    정규화한다. 이 마이그레이션은 **이미 저장된 값**을 표준형으로 맞춘다 —
--    안 맞추면 유효기간 셀렉터(1년/2년/3년)에 아무 칸도 선택 안 된 채로 계속 보인다.
--
-- 안전: 연수로 읽히는 값만 "N년" 으로 바꾼다. ISO 날짜·빈 값·못 알아먹는 값은 손대지 않는다.

do $$
declare
  r record;
  k text;
  arr jsonb;
  out_arr jsonb;
  el jsonb;
  v text;
  n text;
  changed boolean;
  newdata jsonb;
  touched int := 0;
  keys constant text[] := array[
    'rabies_dates', 'general_vaccine_dates', 'civ_dates', 'kennel_cough_dates',
    'internal_parasite_dates', 'external_parasite_dates', 'heartworm_dates'
  ];
begin
  for r in
    select id, coalesce(data, '{}'::jsonb) as data
    from public.cases
    where data::text like '%valid_until%'
  loop
    newdata := r.data;
    changed := false;

    foreach k in array keys loop
      arr := newdata -> k;
      continue when arr is null or jsonb_typeof(arr) <> 'array';
      out_arr := '[]'::jsonb;

      for el in select value from jsonb_array_elements(arr) as t(value) loop
        if jsonb_typeof(el) = 'object' then
          v := el ->> 'valid_until';
          if v is not null then
            n := (regexp_match(btrim(v), '^([0-9]+)\s*(년|y|yr|yrs|year|years)$', 'i'))[1];
            if n is not null and (n || '년') is distinct from v then
              el := jsonb_set(el, '{valid_until}', to_jsonb(n || '년'));
              changed := true;
            end if;
          end if;
        end if;
        out_arr := out_arr || jsonb_build_array(el);
      end loop;

      if changed then newdata := jsonb_set(newdata, array[k], out_arr); end if;
    end loop;

    if changed then
      update public.cases set data = newdata where id = r.id;
      touched := touched + 1;
    end if;
  end loop;

  raise notice '유효기간 표기 정규화: 케이스 % 건', touched;
end $$;
