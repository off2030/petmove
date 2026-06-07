-- =============================================================================
-- 동시 진행(co_progress) — 형제 매칭을 "이메일 우선 + 이름·전화 폴백"으로 통일.
--
-- 배경: 펫무브(portal)는 "같은 보호자"를 이메일로 묶고, 펫무브워크(admin)의 co_progress
-- 는 이름+전화로 묶어 기준이 갈렸다. 두 앱을 이메일 단일 기준으로 통일하되, prod 케이스의
-- 82%(1839건 중 1497건)는 이메일이 없어(운영자 생성·미가입 고객) 이메일만으로는 기존 형제
-- 그룹 대부분(171개 중 135개·300건)이 깨진다.
--
-- 해법(영향 0 보장): 형제 판정을 union 으로 — 이메일이 양쪽에 있고 일치하면 형제,
-- 아니면(이메일 없는 다수) 이름+전화 폴백으로 기존처럼 형제. 백필 불필요 — 규칙 자체가
-- 기존 그룹을 그대로 살린다. 더해 이메일이 있으면 이름 표기 차이(영문/한글·띄어쓰기)에도
-- 같은 보호자를 잡아준다(같은 가족 5건 확인). placeholder 이메일 오염 없음(점검 완료).
--
-- 20260608000012 본문을 그대로 두고, 보호자 매칭 가드 + 형제 SELECT 의 WHERE 만 교체.
-- (matching key 인 email·phone 은 기존대로 nonsync_keys 라 형제에 전파하지 않는다.)
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

  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 (이메일 우선 + 이름·전화 폴백):
  --   · 이메일이 양쪽에 있고 일치              → 형제
  --   · 또는 이름+전화(숫자)가 양쪽에 있고 일치 → 형제
  -- 이메일 없는 케이스(대다수)는 이름+전화 폴백으로 기존처럼 묶이고, 이메일이 있으면
  -- 이름 표기가 달라도(영문/한글·띄어쓰기) 이메일로 같은 보호자를 잡는다.
  src_email := lower(btrim(coalesce(new.data ->> 'email', '')));
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  src_name  := btrim(coalesce(new.customer_name, ''));
  -- 매칭에 쓸 키가 하나도 없으면(이메일도 없고 이름+전화도 불완전) 전파 안 함.
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
