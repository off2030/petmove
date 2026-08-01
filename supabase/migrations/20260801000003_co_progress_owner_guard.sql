-- =============================================================================
-- co_progress 형제 동기화에 소유권 가드 추가 (2026-08-01 보안 리뷰).
--
-- 문제: 형제 판정이 org_id + 보호자 이름 + 전화(숫자만) + 양쪽 co_progress='true'
-- 뿐이라, 세 조건 모두 포털 사용자가 자기 케이스에서 바꿀 수 있는 값이다
-- (이름·전화 = updateCaseInfoFields, org = setVetOrg, co_progress = setCaseCoProgress).
-- 피해자의 이름·전화를 알고 피해자 케이스에 co_progress 가 켜져 있으면, 공격자가
-- 자기 케이스를 위장해 피해자 케이스의 data·destination·departure_date 를 덮어쓸
-- 수 있었다 (읽기는 불가, 쓰기 오염만 — 그래도 출국일이 조용히 바뀌는 도메인).
--
-- 가드: 두 케이스의 연결 계정(case_customer_links.user_id) 집합이
--   ① 교집합이 있거나(같은 보호자 계정이 양쪽에 연결)
--   ② 양쪽 다 비어 있을 때(펫무브워크 운영자만 관리하는 케이스 — 포털 계정 없음)
-- 만 형제로 인정한다. 한쪽만 계정이 연결된 비대칭(공격 시나리오의 형태)은 차단.
-- 운영자 전용 워크플로(링크 0개)와 정상 보호자(양쪽 같은 계정 링크)는 그대로 동작.
--
-- 나머지 로직은 20260801000001(보조칩 3차 제외)과 동일.
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
    'microchip_secondary', 'microchip_tertiary',
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
  -- + 소유권 가드(2026-08-01): 연결 계정 교집합 존재 또는 양쪽 다 링크 0개일 때만.
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
    );

  return new;
end;
$$;
