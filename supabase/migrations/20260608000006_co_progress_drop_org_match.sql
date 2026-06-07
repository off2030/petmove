-- =============================================================================
-- 동시 진행(co_progress) — 형제 매칭에서 org_id 조건 제거 (보호자 단위로 전환). (2/9단계)
--
-- 기존: 같은 org_id + 같은 보호자(이름+전화) 케이스끼리만 동기화. 그런데 진입 경로
-- (직영 /apply = platform vs 병원 신청폼 = 그 org)에 따라 org_id 가 갈려서, 같은
-- 보호자의 동물인데도 안 묶이는 문제가 있었다 (docs/org-model-refactor.md).
--
-- co_progress 는 "한 보호자의 여러 동물" 동기화라 org(조직)와 무관한 차원이다. org_id
-- 조건을 제거하고 보호자(이름+전화) 기준으로만 묶는다. 지금은 조직이 하나뿐이라 다른
-- 조직 동명이인 오매칭 위험도 없다 (둘째 조직 생기면 case_customer_links 로 정밀화 예정).
--
-- 20260608000004 의 함수 본문(microchip_implant 제외 + cascade history INSERT)을 그대로
-- 유지하고, 형제 SELECT 루프의 `sib.org_id = new.org_id` 한 줄만 뺀다.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제 + 플래그 자신 + 항체가(부분 병합).
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
    'rabies_titer_records', 'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
    'rabies_titer_date', 'rabies_titer_value'
  ];
  changed_data  jsonb;
  removed_keys  text[];
  dest_changed  boolean;
  dep_changed   boolean;
  titer_changed boolean;
  src_phone     text;
  sib_row       record;
  new_sib_data  jsonb;
  k             text;
  sib_old_titer jsonb;
  sib_new_titer jsonb;
begin
  -- 형제 cascade UPDATE 는 다시 전파하지 않음.
  if pg_trigger_depth() > 1 then return new; end if;

  -- 삭제됐거나 동시 진행 off 인 원본은 전파 안 함.
  if new.deleted_at is not null then return new; end if;
  if (new.data ->> 'co_progress') = 'false' then return new; end if;

  -- 변경분 추출.
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

  dest_changed  := new.destination is distinct from old.destination;
  dep_changed   := new.departure_date is distinct from old.departure_date;
  titer_changed := (new.data -> 'rabies_titer_records')
                   is distinct from (old.data -> 'rabies_titer_records');

  -- 원본에서 rabies_titer_records 가 통째로 삭제됐으면 형제에서도 제거.
  if titer_changed
     and (old.data ? 'rabies_titer_records')
     and not (new.data ? 'rabies_titer_records') then
    removed_keys := removed_keys || array['rabies_titer_records'];
  end if;

  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정.
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스 루프 — 보호자(이름+전화) 기준. org_id 조건 없음 (조직 무관).
  for sib_row in
    select id, org_id, data, destination, departure_date
    from public.cases sib
    where sib.id <> new.id
      and sib.deleted_at is null
      and btrim(coalesce(sib.customer_name, '')) = btrim(coalesce(new.customer_name, ''))
      and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone
      and coalesce(sib.data ->> 'co_progress', 'true') <> 'false'
  loop
    -- 새 data 계산 (기존 트리거의 SET 표현과 동일).
    new_sib_data := (sib_row.data - removed_keys) || changed_data;
    if titer_changed and (new.data ? 'rabies_titer_records') then
      sib_old_titer := sib_row.data -> 'rabies_titer_records';
      sib_new_titer := public.merge_titer_records(
        new.data -> 'rabies_titer_records',
        sib_old_titer);
      new_sib_data := new_sib_data || jsonb_build_object('rabies_titer_records', sib_new_titer);
    end if;

    -- UPDATE.
    update public.cases
    set
      data           = new_sib_data,
      destination    = case when dest_changed then new.destination    else destination    end,
      departure_date = case when dep_changed  then new.departure_date else departure_date end
    where id = sib_row.id;

    -- case_history INSERT — 형제 입장에서의 변경분.
    -- 1) changed_data 의 각 키 (= 형제 old vs new 다를 때만).
    for k in select * from jsonb_object_keys(changed_data)
    loop
      if (sib_row.data -> k) is distinct from (changed_data -> k) then
        insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
        values (
          sib_row.id, sib_row.org_id, k, 'data',
          public.jsonb_to_history_text(sib_row.data -> k),
          public.jsonb_to_history_text(changed_data -> k)
        );
      end if;
    end loop;

    -- 2) removed_keys — 형제에 있었던 키만.
    foreach k in array removed_keys
    loop
      if sib_row.data ? k then
        insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
        values (
          sib_row.id, sib_row.org_id, k, 'data',
          public.jsonb_to_history_text(sib_row.data -> k),
          null
        );
      end if;
    end loop;

    -- 3) destination 컬럼.
    if dest_changed and sib_row.destination is distinct from new.destination then
      insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
      values (
        sib_row.id, sib_row.org_id, 'destination', 'column',
        sib_row.destination, new.destination
      );
    end if;

    -- 4) departure_date 컬럼.
    if dep_changed and sib_row.departure_date is distinct from new.departure_date then
      insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
      values (
        sib_row.id, sib_row.org_id, 'departure_date', 'column',
        sib_row.departure_date::text, new.departure_date::text
      );
    end if;

    -- 5) 항체가 부분 병합 — old vs new sib 값이 다르면 기록.
    if titer_changed and (new.data ? 'rabies_titer_records')
       and sib_old_titer is distinct from sib_new_titer then
      insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
      values (
        sib_row.id, sib_row.org_id, 'rabies_titer_records', 'data',
        public.jsonb_to_history_text(sib_old_titer),
        public.jsonb_to_history_text(sib_new_titer)
      );
    end if;
  end loop;

  return new;
end;
$$;

notify pgrst, 'reload schema';
