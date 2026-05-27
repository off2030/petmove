-- 다중 목적지 케이스의 destination-scoped 필드를 by_dest 로 백필.
--
-- 배경:
--  - 0c16267 까지: 다중 목적지 케이스에서도 출국일·내원일·entry_*·return_*·permit_no·
--    certificate_no·id_date·deworming_time 가 케이스 단일값으로 저장돼 모든 destination
--    이 같은 값을 공유 (한 곳에 입력 → 다른 destination 탭에도 같이 노출).
--  - 04b6825 / 0c16267: data.by_dest[destination][key] 스코프 도입. 신규 입력은 by_dest 에,
--    read 는 by_dest 우선 + top-level/column fallback.
--  - 본 마이그레이션: 기존 다중 목적지 케이스의 top-level/column 값을 모든 destination
--    토큰에 복제 → destination 칩 전환 시 fallback 의존 없이 by_dest 에서 명시적 값 읽음.
--
-- 정책:
--  1) destination 에 ',' 가 있는 케이스만 대상 (다중 목적지).
--  2) 각 destination 토큰별로, by_dest[token][key] 가 아직 명시적으로 없으면 (null
--     sentinel 포함 X) top-level 값을 복사. departure_date 는 컬럼에서 가져옴.
--  3) top-level / 컬럼 값은 보존 (admin 의 procedure-checks·PDF·auto-fill 이 아직
--     단일값 기준이라 깨지면 안 됨). 후속 단계에서 모듈 보강 후 별도 마이그레이션으로
--     top-level 정리 예정.
--
-- idempotent — 이미 by_dest 에 키가 있으면 (값이 null 이어도) 건드리지 않음.

do $$
declare
  scoped_keys text[] := array[
    'departure_date', 'vet_visit_date',
    'entry_date', 'entry_airport', 'entry_flight_number', 'entry_departure_airport',
    'entry_time', 'entry_transport', 'entry_purpose',
    'return_date', 'return_flight_number', 'return_departure_airport',
    'return_arrival_airport', 'return_transport',
    'permit_no', 'certificate_no', 'id_date',
    'deworming_time'
  ];
  c record;
  next_data jsonb;
  by_dest jsonb;
  tokens text[];
  token text;
  dest_obj_prev jsonb;
  dest_obj jsonb;
  k text;
  source_v jsonb;
  changed boolean;
  case_changed_count int := 0;
  fill_count int := 0;
begin
  for c in
    select id, destination, departure_date, data
    from public.cases
    where destination is not null and destination like '%,%'
  loop
    next_data := coalesce(c.data, '{}'::jsonb);
    by_dest := coalesce(next_data->'by_dest', '{}'::jsonb);
    -- tokens — comma 분리 후 trim, 빈 토큰 제거.
    tokens := array(
      select trim(t)
      from unnest(string_to_array(c.destination, ',')) as t
      where trim(t) <> ''
    );
    changed := false;
    foreach token in array tokens loop
      dest_obj_prev := coalesce(by_dest->token, '{}'::jsonb);
      dest_obj := dest_obj_prev;
      foreach k in array scoped_keys loop
        -- 이미 명시적으로 존재(null sentinel 포함) 하면 skip — idempotent.
        if dest_obj ? k then
          continue;
        end if;
        -- source 결정 — departure_date 는 컬럼, 나머지는 top-level data.
        if k = 'departure_date' then
          if c.departure_date is null then continue; end if;
          source_v := to_jsonb(c.departure_date::text);
        else
          if not (next_data ? k) then continue; end if;
          if jsonb_typeof(next_data->k) = 'null' then continue; end if;
          source_v := next_data->k;
        end if;
        dest_obj := dest_obj || jsonb_build_object(k, source_v);
        fill_count := fill_count + 1;
      end loop;
      if dest_obj <> dest_obj_prev then
        by_dest := by_dest || jsonb_build_object(token, dest_obj);
        changed := true;
      end if;
    end loop;
    if changed then
      next_data := jsonb_set(next_data, '{by_dest}', by_dest, true);
      update public.cases set data = next_data where id = c.id;
      case_changed_count := case_changed_count + 1;
    end if;
  end loop;
  raise notice 'by_dest 백필: 채운 케이스 % 건, (destination, key) 쌍 % 개',
    case_changed_count, fill_count;
end $$;
