-- 나머지 신고국 출국 항공편 출발일 ↔ 출국일 양방향 sync 자동채움 룰 시드 + 백필.
--
-- 배경 (2026-08-24, 20260824000001 의 후속):
--  - 신고 탭 자동 포함은 '일정 있음'(출국일·내원일·출발일·도착일) 이 트리거다. 그런데
--    추가정보에 **날짜 필드가 아예 없던** 나라들(필리핀·대만·이스라엘·키프로스·아일랜드·
--    몰타·노르웨이)은 정보 요청 링크로 아무리 받아도 트리거가 생기지 않았고, 도착일만 받던
--    스위스·미국은 장거리라 도착일 ≠ 출국일이어서 출국일 컬럼이 계속 비었다.
--  - 그래서 신고국 14개 **전부** 추가정보에 출발일(departure_flight_date)을 선언했다.
--    이 파일은 그 9개국의 sync 룰을 일본·하와이·태국과 같은 모양으로 맞춘다.
--
-- 정책(앞선 시드들과 동일):
--  - departure_flight_date ↔ departure_date 양방향, overwrite=true.
--    auto-fill-engine 의 cur===newDate noop 체크로 무한 루프 차단.
--  - idempotent — 같은 (org, destination, trigger, target) 이 이미 있으면 skip.

do $$
declare
  d text;
  ord int := 910;
begin
  foreach d in array array[
    'philippines', 'taiwan', 'switzerland', 'usa', 'israel',
    'cyprus', 'ireland', 'malta', 'norway'
  ] loop
    -- 1) departure_flight_date → departure_date
    insert into public.org_auto_fill_rules
      (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
    select
      o.id, d, 'all', 'departure_flight_date', 'departure_date',
      array[0], true, true, ord
    from public.organizations o
    where not exists (
      select 1 from public.org_auto_fill_rules r
      where r.org_id = o.id
        and r.destination_key = d
        and r.trigger_field = 'departure_flight_date'
        and r.target_field = 'departure_date'
    );

    -- 2) departure_date → departure_flight_date
    insert into public.org_auto_fill_rules
      (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, overwrite_existing, enabled, display_order)
    select
      o.id, d, 'all', 'departure_date', 'departure_flight_date',
      array[0], true, true, ord + 1
    from public.organizations o
    where not exists (
      select 1 from public.org_auto_fill_rules r
      where r.org_id = o.id
        and r.destination_key = d
        and r.trigger_field = 'departure_date'
        and r.target_field = 'departure_flight_date'
    );

    ord := ord + 2;
  end loop;
end $$;

-- ── 백필: 이미 만들어진 케이스의 '출발일' 채우기 ──────────────────────────────
-- 20260824000001 의 백필과 같은 이유·같은 규칙. 다만 여행지 토큰은 **완전일치**로만 본다 —
-- 이 목록엔 '미국' 이 있고 실제 데이터엔 "미국 (하와이)" 같은 값이 있어서, 부분일치로 하면
-- 하와이 케이스를 미국으로 오인해 엉뚱한 자리에 값을 쓴다.
-- 완전일치에서 빠지는 자유입력 값("스위스 제네바" 등)은 다음 저장 때 sync 룰이 채운다.
do $$
declare
  r record;
  dests text[];
  dest text;
  dep text;
  multi boolean;
  newdata jsonb;
  tokens constant text[] := array[
    '필리핀', '대만', '스위스', '미국', '이스라엘', '키프로스', '아일랜드', '몰타', '노르웨이'
  ];
  touched int := 0;
begin
  for r in
    select id, destination, departure_date, coalesce(data, '{}'::jsonb) as data
    from public.cases
    where destination is not null
  loop
    dests := array(
      select btrim(x) from unnest(string_to_array(r.destination, ',')) x where btrim(x) <> ''
    );
    continue when not (dests && tokens);
    multi := coalesce(array_length(dests, 1), 0) > 1;
    newdata := r.data;

    foreach dest in array dests loop
      continue when not (dest = any(tokens));
      dep := coalesce(
        newdata->'by_dest'->dest->>'departure_date',
        case when multi then null else nullif(r.departure_date::text, '') end
      );
      continue when dep is null or dep = '';

      if multi then
        if newdata->'by_dest'->dest is not null
           and coalesce(newdata->'by_dest'->dest->>'departure_flight_date', '') = '' then
          newdata := jsonb_set(
            newdata, array['by_dest', dest, 'departure_flight_date'], to_jsonb(dep), true
          );
        end if;
      elsif coalesce(newdata->'by_dest'->dest->>'departure_flight_date', '') = ''
        and coalesce(newdata->>'departure_flight_date', '') = '' then
        newdata := jsonb_set(newdata, array['departure_flight_date'], to_jsonb(dep), true);
      end if;
    end loop;

    if newdata is distinct from r.data then
      update public.cases set data = newdata where id = r.id;
      touched := touched + 1;
    end if;
  end loop;

  raise notice '출발일 백필(나머지 신고국): 케이스 % 건', touched;
end $$;

notify pgrst, 'reload schema';
