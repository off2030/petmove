-- =============================================================================
-- 동시 진행 — 마이크로칩 삽입일(microchip_implant_date) 을 동기화 대상에서 제외.
--
-- 마이크로칩 번호(microchip 컬럼) 는 이미 per-pet 고유값이라 동기화되지 않는데,
-- 삽입일(microchip_implant_date, data 키) 은 누락돼 형제로 전파되고 있었다.
-- 삽입일도 아이마다 다른 per-pet 값이다 — 한 마리 삽입일을 적으면 이미 칩이 있는
-- 다른 아이의 삽입일까지 덮어쓰는 문제가 있어 nonsync_keys 에 추가한다.
--
-- 20260519000003 의 트리거 본문에서 nonsync_keys 만 변경. merge_titer_records 및
-- 나머지 로직은 그대로.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제 + 플래그 자신.
  -- rabies_titer_records 는 여기서 제외(통째 미러링 방지)하되, 아래에서 회차 단위로
  -- 별도 부분 병합한다. legacy 평면 titer 키들은 계속 완전 제외.
  nonsync_keys constant text[] := array[
    'co_progress',
    'phone', 'email',
    'customer_last_name_en', 'customer_first_name_en',
    'address_kr', 'address_ko', 'address_en', 'address_zipcode', 'postal_code', 'zipcode',
    'birth_date',
    'species', 'breed', 'breed_en', 'color', 'color_en', 'sex', 'sex_en', 'weight',
    -- 마이크로칩 — 번호(microchip 컬럼)·보조칩·삽입일 모두 per-pet 고유값.
    'microchip_secondary', 'microchip_implant_date',
    'notes', 'memo',
    'payments', 'payment_amount', 'payment_method',
    -- 광견병 항체가 — rabies_titer_records 는 회차 단위 부분 병합(별도 처리).
    'rabies_titer_records', 'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
    'rabies_titer_date', 'rabies_titer_value'
  ];
  changed_data  jsonb;
  removed_keys  text[];
  dest_changed  boolean;
  dep_changed   boolean;
  titer_changed boolean;
  src_phone     text;
begin
  -- 형제 cascade UPDATE 는 다시 전파하지 않음 (depth 1 = 사용자 발화 UPDATE 만).
  if pg_trigger_depth() > 1 then return new; end if;

  -- 삭제됐거나 동시 진행 off 인 원본은 전파 안 함 (디폴트 on = 'false' 가 아닐 때).
  if new.deleted_at is not null then return new; end if;
  if (new.data ->> 'co_progress') = 'false' then return new; end if;

  -- 이번 UPDATE 에서 실제로 바뀐 동기화 키만 추출 (전체 미러링이 아니라 변경분 전파).
  changed_data := coalesce((
    select jsonb_object_agg(k.key, new.data -> k.key)
    from jsonb_object_keys(new.data) as k(key)
    where not (k.key = any(nonsync_keys))
      and (new.data -> k.key) is distinct from (old.data -> k.key)
  ), '{}'::jsonb);

  -- 삭제된 동기화 키 — old 에 있고 new 에 없는 syncable 키.
  removed_keys := coalesce((
    select array_agg(k.key)
    from jsonb_object_keys(old.data) as k(key)
    where not (k.key = any(nonsync_keys))
      and not (new.data ? k.key)
  ), array[]::text[]);

  dest_changed := new.destination is distinct from old.destination;
  dep_changed  := new.departure_date is distinct from old.departure_date;

  -- 광견병 항체가 기록 변경 여부 — 채혈일·검사기관·수령일만 형제에 반영(수치 제외).
  titer_changed := (new.data -> 'rabies_titer_records')
                   is distinct from (old.data -> 'rabies_titer_records');

  -- 원본에서 rabies_titer_records 가 통째로 삭제됐으면 형제에서도 제거.
  if titer_changed
     and (old.data ? 'rabies_titer_records')
     and not (new.data ? 'rabies_titer_records') then
    removed_keys := removed_keys || array['rabies_titer_records'];
  end if;

  -- 바뀐 동기화 필드가 없으면 종료.
  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정 (오매칭 방지).
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스에 변경분 반영:
  --   · removed_keys 제거 + changed_data 덮어쓰기 (일반 동기화 필드)
  --   · rabies_titer_records 가 변경+존재하면 회차 단위 부분 병합(value 는 형제값 보존)
  update public.cases sib
  set
    data =
      (sib.data - removed_keys)
      || changed_data
      || (case
            when titer_changed and (new.data ? 'rabies_titer_records')
            then jsonb_build_object(
                   'rabies_titer_records',
                   public.merge_titer_records(
                     new.data -> 'rabies_titer_records',
                     sib.data -> 'rabies_titer_records'))
            else '{}'::jsonb
          end),
    destination    = case when dest_changed then new.destination    else sib.destination    end,
    departure_date = case when dep_changed  then new.departure_date else sib.departure_date end
  where sib.org_id = new.org_id
    and sib.id <> new.id
    and sib.deleted_at is null
    and btrim(coalesce(sib.customer_name, '')) = btrim(coalesce(new.customer_name, ''))
    and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone
    and coalesce(sib.data ->> 'co_progress', 'true') <> 'false';

  return new;
end;
$$;
