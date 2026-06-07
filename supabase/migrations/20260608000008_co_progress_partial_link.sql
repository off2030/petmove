-- =============================================================================
-- 동시 진행(co_progress) — "동시 입력값만 연동, 각자값 독립" 모델로 전환.
-- docs/org-model-refactor.md
--
-- 문제: 기존 트리거는 변경된 키를 형제에 "통째로 덮어쓰기" 했다. 그래서 진행 상황이
-- 다른 두 동물(예: A=항체까지, B=마이크로칩까지)에서 B의 1차 접종을 입력하면 A의
-- rabies_dates([1차,2차,항체])가 B의 [1차]로 덮여 2차·항체가 소실됐다.
--
-- 새 규칙 (형제 케이스의 각 동기화 키에 대해):
--   · 형제 값이 비었으면         → 채운다 (빈 칸 채움)
--   · 형제 값 == 내 "옛 값"(old) → 같이 바꾼다/지운다 (동시에 입력했던 값)
--   · 형제 값 != 내 옛 값         → 보존 (각자 입력한 값 — 연동 안 함)
-- 이로써 "같이 넣은 건 같이, 따로 넣은 건 따로"가 된다. 광견병(배열)도 같은 비교로
-- 처리(배열 통째 비교라 회차가 늘거나 날짜를 같이 수정하는 경우는 일치→연동, 진행이
-- 다르면 불일치→보존). 항체가(titer)는 검사 수치가 per-pet 이라, 형제가 비었거나
-- 동시값일 때만 회차 병합(merge_titer_records: date/lab 공유 + value 보존)한다.
--
-- destination/departure_date 컬럼도 동일 규칙(빈 값 또는 동시값일 때만 반영).
-- case_history 는 형제의 실제 변경분(old sib vs new sib)을 기준으로 기록한다.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제·마이크로칩·항체가(별도 병합).
  nonsync_keys constant text[] := array[
    'co_progress',
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
  dest_changed  boolean;
  dep_changed   boolean;
  titer_changed boolean;
  src_phone     text;
  sib_row       record;
  new_sib_data  jsonb;
  new_dest      text;
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

  -- 이번 UPDATE 에서 바뀐 동기화 키(값) + 삭제된 키.
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

  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
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

    -- 항체가(titer): per-pet 수치라, 형제가 비었거나 동시값(내 옛 titer 와 일치)일 때만
    -- 회차 병합(date/lab 공유 + value 보존). 각자값이면 보존.
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

    -- destination 컬럼: 형제가 비었거나 동시값일 때만.
    new_dest := sib_row.destination;
    if dest_changed
       and (sib_row.destination is null
            or sib_row.destination is not distinct from old.destination) then
      new_dest := new.destination;
    end if;

    -- departure_date 컬럼: 동일.
    new_dep := sib_row.departure_date;
    if dep_changed
       and (sib_row.departure_date is null
            or sib_row.departure_date is not distinct from old.departure_date) then
      new_dep := new.departure_date;
    end if;

    update public.cases
    set data = new_sib_data, destination = new_dest, departure_date = new_dep
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

    if new_dest is distinct from sib_row.destination then
      insert into public.case_history (case_id, org_id, field_key, field_storage, old_value, new_value)
      values (sib_row.id, sib_row.org_id, 'destination', 'column', sib_row.destination, new_dest);
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
