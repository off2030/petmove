-- 태국·말레이시아·인도네시아 출국 항공편 출발일 ↔ 출국일 양방향 sync 자동채움 룰 시드.
--
-- 배경 (2026-08-24 어일용/남촉·남락·남숙 3건):
--  - 세 나라는 케이스 상세 '출국 항공편' 그룹 맨 앞에 출발일을 보여주지만, 그건 프로파일
--    필드가 아니라 departure_date **컬럼**을 화면에서만 얹은 줄이었다(case-detail 의 unshift).
--    필드 목록을 descriptor 에서 만드는 정보 요청 링크의 "{국가} 신고" 프리셋(= 추가정보
--    카테고리 전부)은 그 줄을 볼 수 없어, 보호자에게 출발일을 **묻지도 못한 채** 제출됐다.
--    → cases.departure_date 가 영영 비고 → 신고 탭 자동 포함(출국일·내원일·출발일 트리거)에서
--      케이스가 통째로 빠졌다.
--  - 이제 세 나라 모두 일본·하와이처럼 departure_flight_date 를 프로파일 extraFields 로
--    선언한다. 그 값이 출국일 컬럼과 맞물리도록 여기서 sync 룰을 시드한다.
--
-- 정책(일본 20260527000003 / 하와이 20260818000001 시드와 동일):
--  - departure_flight_date ↔ departure_date 양방향, overwrite=true.
--    auto-fill-engine 의 cur===newDate noop 체크로 무한 루프 차단.
--  - idempotent — 같은 (org, destination, trigger, target) 이 이미 있으면 skip.
--  - 기존 케이스는 소급 적용되지 않는다(룰은 저장 시점에 돈다). 이미 만들어진 케이스는
--    출국일 또는 항공편 출발일을 한 번 다시 저장하면 채워진다.

do $$
declare
  d text;
  ord int := 904;
begin
  foreach d in array array['thailand', 'malaysia', 'indonesia'] loop
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
-- 룰은 저장 시점에만 돈다. 그래서 이 마이그레이션 이전에 만들어진 태국·말레이시아·
-- 인도네시아 케이스는 출국일(departure_date)만 있고 departure_flight_date 가 비어,
-- 배포 직후 케이스 상세 '출국 항공편 > 출발일' 칸이 **빈 것처럼** 보인다(값은 절차정보
-- '출국일'에 그대로 있는데 추가정보 필드가 새 키를 읽기 때문).
-- 이미 있는 출국일을 새 키로 **복사만** 한다 — 기존 값이 있으면 건드리지 않는다.
--
-- 저장 위치는 read 규칙(readEffectiveExtraValue)과 맞춘다:
--   · 다중 여행지 → by_dest[여행지].departure_flight_date (옆 나라로 새지 않게)
--   · 단일 여행지 → top-level data.departure_flight_date (by_dest 에 그 키가 없으면 폴백)
do $$
declare
  r record;
  dests text[];
  dest text;
  dep text;
  multi boolean;
  newdata jsonb;
  touched int := 0;
begin
  for r in
    select id, destination, departure_date, coalesce(data, '{}'::jsonb) as data
    from public.cases
    where destination ~ '태국|말레이시아|인도네시아'
  loop
    dests := array(
      select btrim(x) from unnest(string_to_array(r.destination, ',')) x where btrim(x) <> ''
    );
    multi := coalesce(array_length(dests, 1), 0) > 1;
    newdata := r.data;

    foreach dest in array dests loop
      continue when dest !~ '태국|말레이시아|인도네시아';
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

  raise notice '출발일 백필: 케이스 % 건', touched;
end $$;

notify pgrst, 'reload schema';
