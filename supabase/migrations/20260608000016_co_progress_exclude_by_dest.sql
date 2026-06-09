-- =============================================================================
-- 동시 진행(co_progress) — by_dest 를 형제 동기화 제외(nonsync_keys)에 추가.
--
-- 배경(버그): destination-scoped 값을 data.by_dest[목적지] 로 옮기는 B 마이그레이션 이후,
--   co_progress 트리거가 `by_dest` 를 일반 동기화 키로 취급해 **객체 통째로** 형제에 전파했다.
--   per-key 규칙(형제가 비었거나 동시값일 때만 전파)이 by_dest 단위에선 너무 거칠어,
--   형제의 by_dest 가 비어 있기만 하면 소스의 by_dest 전체(모든 목적지·모든 일정·항공편)가
--   복사됐다. 결과:
--     · 형제 출국일이 다른 동물에 박혀 "동시진행 아닌데 같이 입력"으로 보이고,
--     · 표시는 by_dest 우선이라 형제값이 본인 컬럼값을 가려 "삭제가 안 되는" 유령값이 됨.
--   (실측: 테디←모카 출국일 누수, 오냥←호두 by_dest 통째 누수 2건 확인·복구.)
--
-- 해법: by_dest 를 nonsync_keys 에 추가 → 형제 간 by_dest 전파 중단. 동물별 일정·항공편은
--   각자 고유로 유지한다. 출국일 자체의 동시진행 동기화가 필요하면 departure_date **컬럼**
--   전용 블록(아래 dep_changed)이 그대로 담당한다(컬럼은 단일값이라 누수 위험이 없다).
--
-- 20260608000013 본문 그대로 + nonsync_keys 에 'by_dest' 한 줄 추가만.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화 제외 키 — 고객정보·동물정보·메모·결제·마이크로칩·항체가(별도 병합) + 여정 구조.
  nonsync_keys constant text[] := array[
    'co_progress',
    -- by_dest: 목적지별 일정·항공편 분리 저장. 동물마다 고유 — 형제 전파 금지(통째 누수 차단).
    'by_dest',
    -- 여정 구조 — 동물별 고유, 형제 전파 X. (destination 컬럼은 cascade 자체를 제거.)
    'trip_type',
    'phone', 'email',
    'customer_last_name_en', 'customer_first_name_en',
    'address_kr', 'address_ko', 'address_en', 'address_zipcode', 'postal_code', 'zipcode',
    'birth_date',
    'species', 'breed', 'breed_en', 'color', 'color_en', 'sex', 'sex_en', 'weight',
    'microchip_secondary', 'microchip_implant_date',
    'notes', 'memo',
    'payments', 'payment_amount', 'payment_method',
    'rabies_titer_records', 'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
    'rabies_titer_date', 'rabies_titer_value'
  ];
  changed_data  jsonb;
  removed_keys  text[];
  dep_changed   boolean;
  titer_changed boolean;
  src_email     text;
  src_phone     text;
  src_name      text;
  sib_row       record;
  new_sib_data  jsonb;
  new_dep       date;
  ck            text;
  ov            jsonb;
  sv            jsonb;
  sib_old_titer jsonb;
  sib_new_titer jsonb;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.deleted_at is not null then return new; end if;
  if (new.data ->> 'co_progress') = 'false' then return new; end if;

  -- 이번 UPDATE 에서 바뀐 동기화 키(값) + 삭제된 키. (trip_type·by_dest 는 nonsync 라 제외됨.)
  changed_data := coalesce((
    select jsonb_object_agg(k.key, new.data -> k.key)
    from jsonb_object_keys(new.data) as k(key)
    where not (k.key = any(nonsync_keys))
      and (new.data -> k.key) is distinct from (old.data -> k.key)
  ), '{}'::jsonb);

  removed_keys := coalesce((
    select array_agg(k.key)
    from jsonb_object_keys(old.data) as k(key)
    where not (k.key = any(nonsync_keys))
      and not (new.data ? k.key)
  ), array[]::text[]);

  dep_changed   := new.departure_date is distinct from old.departure_date;
  titer_changed := (new.data -> 'rabies_titer_records')
                   is distinct from (old.data -> 'rabies_titer_records');

  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 (이메일 우선 + 이름·전화 폴백):
  --   · 이메일이 양쪽에 있고 일치              → 형제
  --   · 또는 이름+전화(숫자)가 양쪽에 있고 일치 → 형제
  src_email := lower(btrim(coalesce(new.data ->> 'email', '')));
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  src_name  := btrim(coalesce(new.customer_name, ''));
  if src_email = '' and (src_name = '' or src_phone is null) then
    return new;
  end if;

  for sib_row in
    select id, org_id, data, destination, departure_date
    from public.cases sib
    where sib.id <> new.id
      and sib.deleted_at is null
      and coalesce(sib.data ->> 'co_progress', 'true') <> 'false'
      and (
        (src_email <> ''
         and lower(btrim(coalesce(sib.data ->> 'email', ''))) = src_email)
        or (src_name <> '' and src_phone is not null
            and btrim(coalesce(sib.customer_name, '')) = src_name
            and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone)
      )
  loop
    new_sib_data := sib_row.data;

    -- 변경 키: 형제가 비었거나(채움) 형제 값 == 내 옛 값(동시값)일 때만 전파. 각자값 보존.
    for ck in select jsonb_object_keys(changed_data) loop
      sv := sib_row.data -> ck;
      ov := old.data -> ck;
      if sv is null
         or sv = 'null'::jsonb
         or sv = '""'::jsonb
         or sv = '[]'::jsonb
         or sv is not distinct from ov then
        new_sib_data := new_sib_data || jsonb_build_object(ck, changed_data -> ck);
      end if;
    end loop;

    -- 삭제 키: 형제 값 == 내 옛 값(동시값)일 때만 삭제. 각자값 보존.
    foreach ck in array removed_keys loop
      if (sib_row.data -> ck) is not distinct from (old.data -> ck) then
        new_sib_data := new_sib_data - ck;
      end if;
    end loop;

    -- 항체가(titer): per-pet 수치라, 형제가 비었거나 동시값일 때만 회차 병합.
    if titer_changed and (new.data ? 'rabies_titer_records') then
      sib_old_titer := sib_row.data -> 'rabies_titer_records';
      if sib_old_titer is null
         or sib_old_titer = 'null'::jsonb
         or sib_old_titer = '[]'::jsonb
         or sib_old_titer is not distinct from (old.data -> 'rabies_titer_records') then
        sib_new_titer := public.merge_titer_records(
          new.data -> 'rabies_titer_records', sib_old_titer);
        new_sib_data := new_sib_data || jsonb_build_object('rabies_titer_records', sib_new_titer);
      end if;
    end if;

    -- departure_date 컬럼: 형제가 비었거나 동시값일 때만. (destination 컬럼은 전파하지 않음.)
    new_dep := sib_row.departure_date;
    if dep_changed
       and (sib_row.departure_date is null
            or sib_row.departure_date is not distinct from old.departure_date) then
      new_dep := new.departure_date;
    end if;

    update public.cases
    set data = new_sib_data, departure_date = new_dep
    where id = sib_row.id;

    -- case_history — 형제의 실제 변경분(old sib vs new sib)만 기록.
    for ck in
      select k.key from jsonb_object_keys(sib_row.data) as k(key)
      union
      select k.key from jsonb_object_keys(new_sib_data) as k(key)
    loop
      if (sib_row.data -> ck) is distinct from (new_sib_data -> ck) then
        insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
        values (
          sib_row.id, sib_row.org_id, ck, 'data',
          public.jsonb_to_history_text(sib_row.data -> ck),
          public.jsonb_to_history_text(new_sib_data -> ck)
        );
      end if;
    end loop;

    if new_dep is distinct from sib_row.departure_date then
      insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
      values (sib_row.id, sib_row.org_id, 'departure_date', 'column',
              sib_row.departure_date::text, new_dep::text);
    end if;
  end loop;

  return new;
end;
$$;

notify pgrst, 'reload schema';
