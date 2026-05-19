-- =============================================================================
-- 동시 진행 — 광견병 항체가(rabies titer) 를 동기화 대상에서 제외.
--
-- 20260519000001 후속. 항체가 검사 결과 수치는 채혈일·검사기관이 같더라도
-- 아이마다 다른 per-pet 값이라, 형제 케이스로 전파하면 안 된다. 항체가 데이터는
-- rabies_titer_records 배열({date,lab,value,...}) 하나로 묶여 저장되므로 키 단위로
-- 통째로 비동기화한다 — 각 아이의 항체가는 따로 입력한다.
--
-- create or replace 로 함수 본문만 교체 — 트리거(cases_sync_co_progress)는 함수를
-- 이름으로 참조하므로 재생성 불필요.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제·항체가 + 플래그 자신.
  nonsync_keys constant text[] := array[
    'co_progress',
    'phone', 'email',
    'customer_last_name_en', 'customer_first_name_en',
    'address_kr', 'address_ko', 'address_en', 'address_zipcode', 'postal_code', 'zipcode',
    'birth_date',
    'species', 'breed', 'breed_en', 'color', 'color_en', 'sex', 'sex_en', 'weight',
    'microchip_secondary',
    'notes', 'memo',
    'payments', 'payment_amount', 'payment_method',
    -- 광견병 항체가 — 검사 수치가 아이마다 다른 per-pet 값.
    'rabies_titer_records', 'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
    'rabies_titer_date', 'rabies_titer_value'
  ];
  changed_data jsonb;
  removed_keys text[];
  dest_changed boolean;
  dep_changed  boolean;
  src_phone    text;
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

  -- 바뀐 동기화 필드가 없으면 종료 (co_progress 토글·동물/고객 정보만 바뀐 경우).
  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
     and not dep_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정 (오매칭 방지).
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스에 변경분만 반영 — 삭제 키는 제거, 변경 키는 원본 값으로 교체.
  update public.cases sib
  set
    data = (sib.data - removed_keys) || changed_data,
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
