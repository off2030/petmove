-- =============================================================================
-- co_progress 트리거 회귀 복구 (2026-08-03).
--
-- 사고: HARRIS BEVIN BREH / 시월·은월 — 한쪽에 항공권을 붙여넣자 형제의 by_dest 가
--   통째로 교체되면서 보호자가 공유 링크로 넣은 해외주소가 사라졌고, 변경 이력이
--   한 줄도 없어 되돌릴 수도 없었다.
--
-- 원인: 20260725000001(기본 OFF)이 트리거를 다시 쓰면서, 베이스를 최신판(20260706000001)이
--   아니라 그보다 훨씬 오래된 판으로 잡았다. 헤더에는 "나머지 로직은 동일"이라 적혀 있지만
--   실제로는 아래가 통째로 사라졌고, 20260801000001·20260801000003 이 그 상태를 그대로
--   물려받아 지금까지 운영됐다:
--
--     ① nonsync_keys 에서 by_dest 누락
--        → 목적지별 일정·항공편·해외주소 묶음이 형제에게 **통째로** 복사.
--          20260608000016 에서 같은 사고(테디←모카·오냥←호두)로 이미 한 번 고쳤던 항목.
--     ② nonsync_keys 에서 trip_type·microchip_implant_date·항체가 키 누락
--     ③ per-key 보존 규칙 소실
--        → 예전: 형제가 **비었거나 내 옛값과 같을 때만** 채움(각자값 보존).
--          회귀 후: (sib.data - removed_keys) || changed_data 로 **무조건 덮어씀**.
--          형제가 따로 입력해 둔 값이 조용히 사라지는 가장 위험한 회귀.
--     ④ 항체가 부분 병합(merge_titer_records) 블록 소실 → 통째 전파
--     ⑤ 내원일(vet_visit_date)만 목적지별로 골라 전파하던 전용 블록 소실
--     ⑥ case_history 기록 전부 소실
--        → 20260602000001 이 "왜 갑자기 사라졌나 추적 불가 + restoreToHistoryPoint 로
--          복원 불가"를 고치려고 넣은 것. 이번 사고에서 복구 수단이 없었던 직접 원인.
--     ⑦ destination 컬럼 cascade 부활 → 형제의 목적지가 덮일 수 있음.
--
-- 이 마이그레이션: 20260706000001(마지막 정상판)을 베이스로 되돌리고, 그 뒤의 **의도된**
--   변경 세 가지만 다시 얹는다.
--     · 20260725000001 — 기본 OFF: 원본·형제 **양쪽 모두** 명시적 co_progress='true' 일 때만.
--     · 20260801000001 — microchip_tertiary 도 nonsync.
--     · 20260801000003 — 소유권 가드(연결 계정 교집합 또는 양쪽 링크 0개) + org_id 일치.
--
-- 보호자 매칭은 현재 운영 중인 **좁은 쪽**(org + 이름 + 전화)을 유지한다. 20260706000001 의
--   "이메일 우선" 매칭은 형제 범위를 넓히는 방향이라, 사고 직후 복구 커밋에서 함께 되살리지
--   않는다(필요하면 별도 판단으로 복원).
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
    -- by_dest: 목적지별 일정·항공편·해외주소 분리 저장. 동물마다 고유 — 통째 전파 금지(누수 차단).
    -- 내원일(vet_visit_date)만 아래 전용 블록으로 목적지별 선별 전파.
    'by_dest',
    -- 여정 구조 — 동물별 고유, 형제 전파 X. (destination 컬럼은 cascade 자체를 하지 않는다.)
    'trip_type',
    'phone', 'email',
    'customer_last_name_en', 'customer_first_name_en',
    'address_kr', 'address_ko', 'address_en', 'address_zipcode', 'postal_code', 'zipcode',
    'birth_date',
    'species', 'breed', 'breed_en', 'color', 'color_en', 'sex', 'sex_en', 'weight',
    'microchip_secondary', 'microchip_tertiary', 'microchip_implant_date',
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
  -- 형제 cascade UPDATE 는 다시 전파하지 않음 (depth 1 = 사용자 발화 UPDATE 만).
  if pg_trigger_depth() > 1 then return new; end if;
  if new.deleted_at is not null then return new; end if;

  -- 기본 OFF (2026-07-25) — 키 없음/false 모두 전파 없음, 'true' 만 전파.
  if coalesce(new.data ->> 'co_progress', 'false') <> 'true' then return new; end if;

  -- 이번 UPDATE 에서 바뀐 동기화 키(값) + 삭제된 키. (by_dest·trip_type 등은 nonsync 라 제외됨.)
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

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정 (오매칭 방지).
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  src_name  := btrim(coalesce(new.customer_name, ''));
  if src_name = '' or src_phone is null then
    return new;
  end if;

  -- 형제 루프 — 형제도 명시적 co_progress='true' + 같은 org + 소유권 가드(2026-08-01):
  --   ① 연결 계정 교집합이 있거나 ② 양쪽 다 링크 0개(운영자 전용 케이스)일 때만.
  for sib_row in
    select sib.id, sib.org_id, sib.data, sib.destination, sib.departure_date
    from public.cases sib
    where sib.org_id = new.org_id
      and sib.id <> new.id
      and sib.deleted_at is null
      and btrim(coalesce(sib.customer_name, '')) = src_name
      and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone
      and sib.data ->> 'co_progress' = 'true'
      and (
        exists (
          select 1
          from public.case_customer_links a
          join public.case_customer_links b on b.user_id = a.user_id
          where a.case_id = new.id and b.case_id = sib.id
        )
        or (
          not exists (select 1 from public.case_customer_links a where a.case_id = new.id)
          and not exists (select 1 from public.case_customer_links b where b.case_id = sib.id)
        )
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
