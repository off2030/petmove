-- =============================================================================
-- 동시 진행 — 광견병 항체가 '수치' 전파 재발 차단 (2026-09-09).
--
-- 증상: 동시 진행이 켜진 형제 케이스에 항체검사 결과 수치까지 그대로 복사됐다.
--   항체가 수치는 채혈일·검사기관이 같아도 아이마다 다른 per-pet 값이라 절대
--   전파하면 안 된다(20260519000002 에서 처음 막고, 20260519000003 에서 회차만
--   부분 병합하도록 정리한 규칙).
--
-- 원인: 운영 DB 의 sync_co_progress_to_siblings 가 항체가 가드가 있는 최신판
--   (20260803000001)이 아니었다. 이 함수는 그동안 create or replace 로 여러 번
--   교체됐고(20260725000001 · 20260801000001 · 20260801000003), 그 중 항체가 관련
--   키·병합 블록이 빠진 판본이 남아 있으면 수치가 통째로 형제에게 넘어간다.
--
-- 조치: 리포지토리 truth(20260803000001)의 함수 본문을 그대로 다시 적용하고,
--   여기에 방어선 하나를 추가한다 — nonsync_keys 목록과 별개로 'rabies_titer%'
--   패턴 키는 일반 전파(changed_data·removed_keys)에서 무조건 배제. 목록을 손대는
--   후속 마이그레이션이 항목을 빠뜨려도 수치가 새지 않는다.
--
--   항체가는 지금까지처럼 merge_titer_records 로 **회차(채혈일·검사기관)만** 병합하고
--   value 는 형제 자신의 값을 유지한다(형제가 비었으면 공란). 수치는 각자 입력.
--
-- 멱등: create or replace + drop/create trigger. 여러 번 실행해도 안전.
-- =============================================================================

-- ── 회차 부분 병합 (20260519000003 과 동일 본문) — 함수 유실 대비 재적용 ─────────
-- src 회차 목록을 그대로 쓰되 value 만 dst(형제)의 같은 회차 값으로 되돌린다.
create or replace function public.merge_titer_records(src jsonb, dst jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(s.el) = 'object'
        then (s.el - 'value')
             || jsonb_build_object(
                  'value',
                  coalesce(
                    case
                      when jsonb_typeof(dst) = 'array'
                      then dst -> ((s.ord - 1)::int) -> 'value'
                    end,
                    'null'::jsonb
                  ))
        else s.el
      end
      order by s.ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(src) = 'array' then src else '[]'::jsonb end
  ) with ordinality as s(el, ord)
$$;

-- ── 동기화 트리거 함수 — 20260803000001 본문 + rabies_titer% 패턴 가드 ──────────
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
      -- 방어선 2 — 위 목록에서 빠지더라도 rabies_titer* 키는 절대 일반 전파를 타지 않는다.
      and k.key not like 'rabies_titer%'
      and (new.data -> k.key) is distinct from (old.data -> k.key)
  ), '{}'::jsonb);

  removed_keys := coalesce((
    select array_agg(k.key)
    from jsonb_object_keys(old.data) as k(key)
    where not (k.key = any(nonsync_keys))
      and k.key not like 'rabies_titer%'
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

-- 트리거 재생성 — 함수는 이름으로 참조되므로 본문 교체만으로 충분하지만,
-- 트리거 자체가 유실된 환경(복원·수동 조작)을 대비해 멱등 재생성한다.
drop trigger if exists cases_sync_co_progress on public.cases;
create trigger cases_sync_co_progress
  after update on public.cases
  for each row
  execute function public.sync_co_progress_to_siblings();

notify pgrst, 'reload schema';
