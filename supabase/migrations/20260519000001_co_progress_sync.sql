-- =============================================================================
-- 동시 진행(co-progress) — 같은 보호자의 여러 동물이 함께 출국 준비할 때,
-- 한 케이스의 절차·추가 정보 입력을 형제 케이스에 자동 반영.
--
-- case.data.co_progress (boolean) — 디폴트 on (키 없음 또는 false 가 아니면 on).
-- 펫무브워크 상세페이지·펫무브 정보탭의 "동시 진행" 토글이 이 키를 쓴다.
--
-- 트리거 cases_sync_co_progress (AFTER UPDATE):
--   원본 케이스의 co_progress 가 on 이고 이번 UPDATE 에서 동기화 대상(절차/추가)
--   필드가 실제로 바뀌었으면, 같은 org·같은 보호자(이름+전화번호)의 다른 케이스 중
--   co_progress on 인 것들에 "바뀐 필드만" 그대로 반영한다.
--
--   - 전체 미러링이 아니라 변경분 전파 — 빈 케이스를 건드려도 형제 데이터를 덮어쓰지 않음.
--   - 동물정보(품종·생년월일 등)·고객정보(전화·주소 등)·메모·결제는 비동기화(NONSYNC).
--     형제의 해당 값은 보존된다.
--   - destination·departure_date 컬럼 + data 의 나머지 키가 동기화 대상.
--   - 형제 cascade UPDATE 가 트리거를 다시 타지 않도록 pg_trigger_depth() 로 차단.
--   - 보호자 매칭은 이름·전화번호가 둘 다 있어야 성립 (오매칭 방지, fail-closed).
--
-- 양쪽 앱의 모든 케이스 저장 경로(펫무브워크 updateCaseField, 펫무브 step/info
-- 액션들)가 이 트리거 하나를 거치므로, 동기화 로직의 단일 출처가 된다.
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

  -- 형제 케이스에 변경분만 반영 — 삭제 키는 제거, 변경 키는 원본 값으로 교체.
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
    and coalesce(sib.data ->> 'co_progress', 'true') <> 'false';

  return new;
end;
$$;

drop trigger if exists cases_sync_co_progress on public.cases;
create trigger cases_sync_co_progress
  after update on public.cases
  for each row
  execute function public.sync_co_progress_to_siblings();
