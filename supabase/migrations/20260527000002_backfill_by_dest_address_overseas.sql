-- address_overseas 키 추가 백필.
--
-- 배경:
--  - 20260527000001 마이그레이션에서 destination-scoped 키 백필 시 address_overseas 는
--    "🟢 케이스 공통" 으로 분류돼 제외됐었음 (보호자 신원 류로 본 분류).
--  - 이후 정책 재검토: 도착국 거주지 주소이므로 destination 별로 다른 게 맞음 →
--    분리 키로 재분류. 본 마이그레이션이 기존 다중 목적지 케이스의 top-level
--    address_overseas 값을 모든 destination 토큰의 by_dest 로 복제.
--
-- 정책 (20260527000001 와 동일):
--  1) destination 에 ',' 가 있는 케이스만 (다중 목적지).
--  2) by_dest[token].address_overseas 가 이미 명시적으로 존재 (null sentinel 포함)
--     하면 skip.
--  3) top-level data.address_overseas 값은 보존 (단일 목적지 케이스가 동일 키 사용).
--
-- idempotent — 이미 by_dest 에 있으면 건드리지 않음.

do $$
declare
  c record;
  next_data jsonb;
  by_dest jsonb;
  tokens text[];
  token text;
  dest_obj_prev jsonb;
  dest_obj jsonb;
  changed boolean;
  case_changed_count int := 0;
  fill_count int := 0;
begin
  for c in
    select id, destination, data
    from public.cases
    where destination is not null and destination like '%,%'
      and data ? 'address_overseas'
      and jsonb_typeof(data->'address_overseas') <> 'null'
  loop
    next_data := coalesce(c.data, '{}'::jsonb);
    by_dest := coalesce(next_data->'by_dest', '{}'::jsonb);
    tokens := array(
      select trim(t)
      from unnest(string_to_array(c.destination, ',')) as t
      where trim(t) <> ''
    );
    changed := false;
    foreach token in array tokens loop
      dest_obj_prev := coalesce(by_dest->token, '{}'::jsonb);
      dest_obj := dest_obj_prev;
      if not (dest_obj ? 'address_overseas') then
        dest_obj := dest_obj || jsonb_build_object('address_overseas', next_data->'address_overseas');
        fill_count := fill_count + 1;
      end if;
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
  raise notice 'address_overseas 백필: 채운 케이스 % 건, 채운 (destination, key) 쌍 % 개',
    case_changed_count, fill_count;
end $$;
