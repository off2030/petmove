-- =============================================================================
-- 동시 진행(co_progress) — 내원일(검진일)만 형제 케이스로 목적지별 전파.
--
-- 배경: 20260608000016 에서 `by_dest` 를 nonsync_keys 에 넣어 형제 간 by_dest 통째
--   전파를 막았다(테디←모카·오냥←호두 누수 복구). 그 부수효과로 by_dest 안에 저장되는
--   내원일(vet_visit_date)도 형제 동기화에서 빠졌다. 하지만 동시진행 형제는 보통 같은 날
--   같은 병원에서 검진을 받으므로 내원일 연동은 실용적이다.
--
-- 해법: by_dest 통째 전파(누수)는 계속 금지하고, `vet_visit_date` **한 키만** 목적지별로
--   전파하는 전용 블록을 추가한다(departure_date 컬럼 블록과 같은 철학):
--     · 소스에서 by_dest[dest].vet_visit_date 가 바뀐 목적지 토큰만 대상.
--     · 형제가 그 목적지를 **실제로 가지고 있을 때만**(destination 컬럼 토큰 매칭) —
--       형제가 안 가는 목적지를 새로 만들지 않는다(누수 방지).
--     · 형제의 해당 목적지 내원일이 **비었거나 동시값(내 옛값)일 때만** 채운다 — 각자값 보존.
--   예정 내원일(vet_visit_date_scheduled)·검역일 등 다른 목적지별 일정은 전파 대상 아님.
--
-- 20260608000016 본문 그대로 + vet_changes 계산·early-exit·형제 전파·이력 블록 추가.
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
    -- by_dest: 목적지별 일정·항공편 분리 저장. 동물마다 고유 — 통째 전파 금지(누수 차단).
    -- 내원일(vet_visit_date)만 아래 전용 블록으로 목적지별 선별 전파.
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
  vet_changes   jsonb;   -- { [목적지토큰]: 새 vet_visit_date jsonb } — 바뀐 목적지만.
  src_email     text;
  src_phone     text;
  src_name      text;
  sib_row       record;
  new_sib_data  jsonb;
  new_dep       date;
  ck            text;
  vk            text;
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

  -- 내원일: by_dest 의 각 목적지 토큰별로 vet_visit_date 가 바뀌었는지. (by_dest 통째가 아니라
  -- 이 한 키만.) new.data->'by_dest' 없으면(jsonb_object_keys strict) 0행 → '{}'.
  vet_changes := coalesce((
    select jsonb_object_agg(
      k.key,
      coalesce(new.data -> 'by_dest' -> k.key -> 'vet_visit_date', 'null'::jsonb))
    from jsonb_object_keys(
      case when jsonb_typeof(new.data -> 'by_dest') = 'object'
           then new.data -> 'by_dest' else '{}'::jsonb end
    ) as k(key)
    where (new.data -> 'by_dest' -> k.key -> 'vet_visit_date')
          is distinct from (old.data -> 'by_dest' -> k.key -> 'vet_visit_date')
  ), '{}'::jsonb);

  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dep_changed
     and not titer_changed
     and vet_changes = '{}'::jsonb then
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

    -- 내원일(검진일): by_dest[dest].vet_visit_date 한 키만 목적지별 전파. by_dest 통째 전파는
    -- 금지(누수). 형제가 그 목적지를 실제로 가질 때만, 비었거나 동시값일 때만 채운다.
    if vet_changes <> '{}'::jsonb then
      for vk in select jsonb_object_keys(vet_changes) loop
        -- 형제가 이 목적지를 실제로 가지고 있어야 전파(없는 목적지 생성 금지 = 누수 차단).
        if exists (
          select 1
          from unnest(string_to_array(coalesce(sib_row.destination, ''), ',')) as t(v)
          where btrim(t.v) = vk
        ) then
          sv := new_sib_data -> 'by_dest' -> vk -> 'vet_visit_date';
          ov := old.data -> 'by_dest' -> vk -> 'vet_visit_date';
          if sv is null
             or sv = 'null'::jsonb
             or sv = '""'::jsonb
             or sv is not distinct from ov then
            -- 중간 객체(by_dest, by_dest[dest]) 보장 후 leaf 설정. jsonb_set 은 중간 키를
            -- 만들지 않으므로 명시 보강.
            if new_sib_data -> 'by_dest' is null
               or jsonb_typeof(new_sib_data -> 'by_dest') <> 'object' then
              new_sib_data := new_sib_data || jsonb_build_object('by_dest', '{}'::jsonb);
            end if;
            if new_sib_data -> 'by_dest' -> vk is null
               or jsonb_typeof(new_sib_data -> 'by_dest' -> vk) <> 'object' then
              new_sib_data := jsonb_set(new_sib_data, array['by_dest', vk], '{}'::jsonb, true);
            end if;
            new_sib_data := jsonb_set(
              new_sib_data, array['by_dest', vk, 'vet_visit_date'],
              coalesce(vet_changes -> vk, 'null'::jsonb), true);
          end if;
        end if;
      end loop;
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
    -- by_dest 는 blob 이라 여기서 제외하고, 내원일은 아래에서 목적지별로 깔끔히 기록.
    for ck in
      select k.key from jsonb_object_keys(sib_row.data) as k(key)
      union
      select k.key from jsonb_object_keys(new_sib_data) as k(key)
    loop
      if ck <> 'by_dest'
         and (sib_row.data -> ck) is distinct from (new_sib_data -> ck) then
        insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
        values (
          sib_row.id, sib_row.org_id, ck, 'data',
          public.jsonb_to_history_text(sib_row.data -> ck),
          public.jsonb_to_history_text(new_sib_data -> ck)
        );
      end if;
    end loop;

    -- 내원일 전파 이력 — by_dest blob 대신 목적지별 vet_visit_date 만 기록.
    if vet_changes <> '{}'::jsonb then
      for vk in select jsonb_object_keys(vet_changes) loop
        if (sib_row.data -> 'by_dest' -> vk -> 'vet_visit_date')
           is distinct from (new_sib_data -> 'by_dest' -> vk -> 'vet_visit_date') then
          insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
          values (
            sib_row.id, sib_row.org_id, 'vet_visit_date', 'data',
            public.jsonb_to_history_text(sib_row.data -> 'by_dest' -> vk -> 'vet_visit_date'),
            public.jsonb_to_history_text(new_sib_data -> 'by_dest' -> vk -> 'vet_visit_date')
          );
        end if;
      end loop;
    end if;

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
