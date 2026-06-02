-- =============================================================================
-- 동시 진행(co_progress) 트리거 cascade 가 case_history 에 기록되도록 보강.
--
-- 문제: 옛 트리거는 형제 케이스를 자동 UPDATE 하면서 audit trail (case_history)
-- 을 남기지 않았다. 그 결과:
--   - 보호자 화면이나 운영자 화면에서 "왜 갑자기 사라졌나" 추적 불가
--   - restoreToHistoryPoint 가 history 기반이라 cascade 로 사라진 필드는 복원 X
--
-- 수정: 형제별로 변경/삭제된 키마다 case_history 행을 INSERT.
-- field_storage = 'data' | 'column' 구분, JSON 직렬화는 cases.ts serializeForHistory 와 동일 규칙.
--
-- 참고: 트리거 안 INSERT 도 자신을 재귀 호출하지 않음 (case_history 는 별도 테이블이라 cases 트리거 영향 X).
-- =============================================================================

-- JSONB 값을 cases.ts 의 serializeForHistory(data) 와 동일 규칙으로 직렬화.
-- - SQL NULL / JSONB null / 빈 문자열 → NULL
-- - 그 외 → JSON 문자열 (J.stringify 결과와 동일 — to_jsonb(...)::text)
create or replace function public.jsonb_to_history_text(j jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when j is null then null
    when j = 'null'::jsonb then null
    when jsonb_typeof(j) = 'string' and j::text = '""' then null
    else j::text
  end;
$$;

-- 트리거 함수 재정의 — 기존 cascade 로직 유지 + sib 별 case_history INSERT.
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
    'microchip_secondary',
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

  -- 보호자 매칭.
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스 루프 — 각 형제마다 (1) 새 데이터 계산 (2) UPDATE (3) case_history INSERT.
  for sib_row in
    select id, org_id, data, destination, departure_date
    from public.cases sib
    where sib.org_id = new.org_id
      and sib.id <> new.id
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
