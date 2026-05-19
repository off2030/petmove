-- =============================================================================
-- 동시 진행 — 광견병 항체가(rabies titer) 를 "부분 동기화" 로 전환.
--
-- 20260519000002 는 rabies_titer_records 를 통째로 동기화 제외했었다. 그러나 형제
-- 동물을 함께 채혈하면 채혈일(date)·검사기관(lab)·검체수령일(received_date) 은
-- 동일하고, 검사 수치(value) 만 아이마다 다르다. 통째 제외는 공유 가능한 날짜·기관
-- 까지 따로 입력하게 만들어 불편하다.
--
-- 이 마이그레이션은 rabies_titer_records 를 회차(배열 index) 단위로 병합한다:
--   · date / lab / received_date 등 value 외 모든 필드 → 원본 케이스 값으로 형제에 반영
--   · value(검사 수치)              → 형제 케이스의 기존 값을 그대로 보존 (per-pet)
--
-- 회차 = 배열 index (inspection_status_titer_{idx} 키와 동일한 회차 식별 규칙).
-- 형제는 원본과 같은 회차 수를 갖게 되며, 신규 회차의 value 는 null 로 채워진다.
-- 원본에서 rabies_titer_records 가 통째로 삭제되면 형제에서도 제거된다.
--
-- legacy 평면 키(rabies_titer_test_date / rabies_titer / rabies_titer_lab 등) 는
-- 읽기 전용 fallback 일 뿐 앱이 더는 쓰지 않으므로 계속 동기화 제외로 둔다.
-- =============================================================================

-- ── 회차 단위 병합 헬퍼 ──────────────────────────────────────────────────────
-- src: 원본 케이스의 rabies_titer_records (권위 — date/lab/received_date 출처)
-- dst: 형제 케이스의 기존 rabies_titer_records (value 출처)
-- 반환: src 와 같은 길이·순서의 배열. 각 원소 = src 원소에서 value 만 dst 동일
--       index 의 value 로 치환 (dst 에 해당 index 없으면 null).
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

-- ── 트리거 함수 본문 교체 — rabies_titer_records 부분 동기화 반영 ─────────────
create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제 + 플래그 자신.
  -- rabies_titer_records 는 여기서 제외(통째 미러링 방지)하되, 아래에서 회차 단위로
  -- 별도 부분 병합한다. legacy 평면 titer 키들은 계속 완전 제외.
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
    -- 광견병 항체가 — rabies_titer_records 는 회차 단위 부분 병합(별도 처리).
    'rabies_titer_records', 'rabies_titer_test_date', 'rabies_titer', 'rabies_titer_lab',
    'rabies_titer_date', 'rabies_titer_value'
  ];
  changed_data  jsonb;
  removed_keys  text[];
  dest_changed  boolean;
  dep_changed   boolean;
  titer_changed boolean;
  src_phone     text;
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

  -- 광견병 항체가 기록 변경 여부 — 채혈일·검사기관·수령일만 형제에 반영(수치 제외).
  titer_changed := (new.data -> 'rabies_titer_records')
                   is distinct from (old.data -> 'rabies_titer_records');

  -- 원본에서 rabies_titer_records 가 통째로 삭제됐으면 형제에서도 제거.
  if titer_changed
     and (old.data ? 'rabies_titer_records')
     and not (new.data ? 'rabies_titer_records') then
    removed_keys := removed_keys || array['rabies_titer_records'];
  end if;

  -- 바뀐 동기화 필드가 없으면 종료.
  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
     and not dep_changed
     and not titer_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정 (오매칭 방지).
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스에 변경분 반영:
  --   · removed_keys 제거 + changed_data 덮어쓰기 (일반 동기화 필드)
  --   · rabies_titer_records 가 변경+존재하면 회차 단위 부분 병합(value 는 형제값 보존)
  update public.cases sib
  set
    data =
      (sib.data - removed_keys)
      || changed_data
      || (case
            when titer_changed and (new.data ? 'rabies_titer_records')
            then jsonb_build_object(
                   'rabies_titer_records',
                   public.merge_titer_records(
                     new.data -> 'rabies_titer_records',
                     sib.data -> 'rabies_titer_records'))
            else '{}'::jsonb
          end),
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
