-- =============================================================================
-- 동시 진행(co_progress) — 여정 구조(destination·trip_type)는 형제로 전파하지 않음.
--
-- 배경: 함께 준비 = "같은 곳·같은 트립으로 가는 형제끼리 준비(일정·절차)를 공유". 어느 나라로
-- 가는지(destination 목록)와 왕복/편도(trip_type)는 동물별 고유 '여정 구조'라 형제와 공유 대상이
-- 아니다. 그런데 기존 트리거는 이 둘도 "동시값" 휴리스틱으로 형제에 전파해서:
--   - A 에 목적지(미국)를 추가하면 B.destination 까지 "일본, 미국" 으로 바뀌어 B 에도 미국 여정
--     카드가 생겼다 (보고된 버그). 형제가 같은 목적지(일본)를 공유한다는 이유로 destination
--     '목록 전체'를 따라가게 만든 게 원인.
--   - trip_type 도 같이 전파돼 A 의 왕복/편도 변경이 B 로 샜다.
--
-- 수정:
--   1) trip_type 을 nonsync_keys 에 추가 — 형제 간 동기화 제외(왕복/편도는 동물별).
--   2) destination 컬럼 cascade 제거 — 형제 destination 은 절대 건드리지 않음.
-- 일정 데이터(by_dest·top-level)·광견병·항체가 등 '준비' 동기화는 그대로 유지 — 같은 목적지로
-- 가는 형제끼리 일정 공유가 함께 준비의 본래 가치다.
--
-- 짝(portal): UI hasSiblingForDestination 은 '같은 목적지 + 같은 트립'일 때만 함께 준비를 노출하고,
-- 묶인 목적지의 트립을 바꾸면 co_progress=false 로 해제한다. 트리거는 그 해제를 존중
-- (co_progress=false 원본은 동기화 X). 20260608000008 본문에서 위 두 군데만 변경.
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
    -- 여정 구조 — 동물별 고유, 형제 전파 X. (destination 컬럼은 아래에서 cascade 자체를 제거.)
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
  src_phone     text;
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

  -- 이번 UPDATE 에서 바뀐 동기화 키(값) + 삭제된 키. (trip_type 은 nonsync 라 제외됨.)
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

  -- destination 변경만 있고 동기화 데이터·출국일·항체가 변화가 없으면 전파 안 함
  -- (destination 은 더 이상 cascade 대상이 아니므로 dest_changed 게이트를 뺀다).
  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화(숫자만) 둘 다 있어야.
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  for sib_row in
    select id, org_id, data, destination, departure_date
    from public.cases sib
    where sib.id <> new.id
      and sib.deleted_at is null
      and btrim(coalesce(sib.customer_name, '')) = btrim(coalesce(new.customer_name, ''))
      and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone
      and coalesce(sib.data ->> 'co_progress', 'true') <> 'false'
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

    -- departure_date 컬럼: 형제가 비었거나 동시값일 때만. (destination 컬럼은 전파하지 않음 — 제거.)
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
