-- =============================================================================
-- 동시 진행(co_progress) 기본값 ON → OFF (2026-07-25 사용자 결정).
--
-- 배경: 기본 ON 이라 같은 보호자(이름+전화)의 형제 케이스에 절차 입력이 자동
-- 전파됐다. 펫무브(보호자 앱)에는 토글이 없어 보호자가 인지·제어할 수 없는데,
-- 목적지가 전혀 다른 두 동물(예: 그리스행·튀르키예행) 사이에도 채혈 예정일 등이
-- 복사되는 사고가 났다(2026-07-25 발견 — 말랑이 → 밀꾸 rabies_titer_scheduled).
--
-- 변경: 원본·형제 모두 **명시적 co_progress = 'true' 일 때만** 동기화.
--   - 키 없음 = OFF (구: 키 없음 = ON).
--   - 펫무브워크 토글이 켜진 쌍만 함께 준비로 묶인다.
--   - 나머지 로직(변경분 전파·NONSYNC 키·보호자 매칭·depth 가드)은 동일.
-- =============================================================================

create or replace function public.sync_co_progress_to_siblings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 동기화에서 제외할 data 키 — 고객정보·동물정보·메모·결제 + 플래그 자신.
  nonsync_keys constant text[] := array[
    'co_progress',
    'phone', 'email',
    'customer_last_name_en', 'customer_first_name_en',
    'address_kr', 'address_ko', 'address_en', 'address_zipcode', 'postal_code', 'zipcode',
    'birth_date',
    'species', 'breed', 'breed_en', 'color', 'color_en', 'sex', 'sex_en', 'weight',
    'microchip_secondary',
    'notes', 'memo',
    'payments', 'payment_amount', 'payment_method'
  ];
  changed_data jsonb;
  removed_keys text[];
  dest_changed boolean;
  dep_changed  boolean;
  src_phone    text;
begin
  -- 형제 cascade UPDATE 는 다시 전파하지 않음 (depth 1 = 사용자 발화 UPDATE 만).
  if pg_trigger_depth() > 1 then return new; end if;

  -- 삭제됐거나 동시 진행이 명시적으로 켜져 있지 않은 원본은 전파 안 함.
  -- 기본 OFF — 키 없음/false 모두 전파 없음, 'true' 만 전파(2026-07-25 변경).
  if new.deleted_at is not null then return new; end if;
  if coalesce(new.data ->> 'co_progress', 'false') <> 'true' then return new; end if;

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

  -- 바뀐 동기화 필드가 없으면 종료 (co_progress 토글·동물/고객 정보만 바뀐 경우).
  if changed_data = '{}'::jsonb
     and cardinality(removed_keys) = 0
     and not dest_changed
     and not dep_changed then
    return new;
  end if;

  -- 보호자 매칭 — 이름·전화번호(숫자만) 둘 다 있어야 형제로 인정 (오매칭 방지).
  src_phone := nullif(regexp_replace(coalesce(new.data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if btrim(coalesce(new.customer_name, '')) = '' or src_phone is null then
    return new;
  end if;

  -- 형제 케이스에 변경분만 반영 — 형제도 명시적 co_progress = 'true' 만(기본 OFF).
  update public.cases sib
  set
    data = (sib.data - removed_keys) || changed_data,
    destination    = case when dest_changed then new.destination    else sib.destination    end,
    departure_date = case when dep_changed  then new.departure_date else sib.departure_date end
  where sib.org_id = new.org_id
    and sib.id <> new.id
    and sib.deleted_at is null
    and btrim(coalesce(sib.customer_name, '')) = btrim(coalesce(new.customer_name, ''))
    and nullif(regexp_replace(coalesce(sib.data ->> 'phone', ''), '[^0-9]', '', 'g'), '') = src_phone
    and sib.data ->> 'co_progress' = 'true';

  return new;
end;
$$;
