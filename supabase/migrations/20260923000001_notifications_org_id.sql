-- =============================================================================
-- 알림에 조직 꼬리표 — notifications.org_id (2026-09-23)
-- =============================================================================
-- WHY: super_admin 은 펫무브(직영) + 로잔 두 org 의 멤버라, 두 조직의 알림이
--      한 목록에 섞여 내려온다. 본문만 봐서는 "신규 등록 안내 · 베트남" 이
--      직영 신청인지 로잔 고객인지 알 수 없고, 눌러서 케이스를 열어도 활성 조직이
--      다르면 상세가 비어 보인다.
--   → 알림 행 자체에 소속 org 를 박아, 목록에서 조직을 구분하고(칩·필터)
--     다른 조직 알림은 조직 전환 후 열도록 한다.
--
-- 이 마이그레이션이 하는 일:
--   1) notifications.org_id 컬럼 + 인덱스
--   2) 기존 행 백필 (case_id → cases.org_id)
--   3) 알림을 만드는 DB 함수 3종에 org_id 채우기
--      (신규 신청 / 공유 링크 제출 / 계정 삭제 통보)
--
-- 멱등 — 여러 번 실행해도 안전.
-- =============================================================================

-- ─────────────────────────────────────────────────
-- 1. 컬럼
-- ─────────────────────────────────────────────────
-- org 삭제는 cases 가 restrict 로 막고 있지만, 알림은 org 가 사라져도 남기는 쪽이
-- 맞으므로 set null.
alter table public.notifications
  add column if not exists org_id uuid references public.organizations (id) on delete set null;

comment on column public.notifications.org_id is
  '알림이 속한 조직 — 여러 org 의 멤버(super_admin)가 목록에서 출처를 구분하고 조직 전환 후 열 수 있게. 조직 맥락이 없는 옛 행은 null.';

create index if not exists notifications_user_org_created_idx
  on public.notifications (user_id, org_id, created_at desc);

-- ─────────────────────────────────────────────────
-- 2. 백필 — 케이스가 달린 알림은 그 케이스의 org
-- ─────────────────────────────────────────────────
-- 케이스 없는 알림(서비스 문의·파트너 연결 등)은 출처를 되살릴 방법이 없어 null 로 둔다.
-- UI 는 null 이면 칩을 숨긴다.
update public.notifications n
set org_id = c.org_id
from public.cases c
where n.case_id = c.id
  and n.org_id is null;

-- ─────────────────────────────────────────────────
-- 3-1. 신규 신청 알림 — org_id 추가 (본문·수신자 동일)
-- ─────────────────────────────────────────────────
create or replace function public.notify_new_apply_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  body text;
begin
  begin
    body := '신규 등록 안내';
    body := body || E'\n\n고객 · ' || coalesce(nullif(new.customer_name, ''), '-');
    if coalesce(new.pet_name, '') <> '' then
      body := body || E'\n동물 · ' || new.pet_name;
    end if;
    if coalesce(new.destination, '') <> '' then
      body := body || E'\n목적지 · ' || new.destination;
    end if;

    insert into public.notifications (user_id, case_id, org_id, content)
    select user_id, new.id, new.org_id, body
    from public.memberships
    where org_id = new.org_id;
  exception when others then
    -- best-effort: 알림 실패가 신청 접수(INSERT)를 막지 않도록 무시.
    null;
  end;
  return new;
end;
$$;

comment on function public.notify_new_apply_case() is
  '신청폼(source=apply_form) 케이스 INSERT 시 org 멤버 전원에게 notifications 적재(org_id 포함).';

-- ─────────────────────────────────────────────────
-- 3-2. 공유 링크 제출 알림 — org_id 추가
--      (20260826000002 본문 = 입력 항목 수 포함 버전을 그대로 유지)
-- ─────────────────────────────────────────────────
create or replace function public.notify_share_link_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c    record;
  pet  text;
  cnt  int;
  body text;
begin
  begin
    -- 링크 생성자 = 알림 수신자. 없으면 보낼 곳이 없으므로 생략.
    if new.created_by is null then
      return new;
    end if;

    select customer_name, pet_name, pet_name_en, destination, org_id
      into c
      from public.cases
      where id = new.case_id
      limit 1;

    pet := coalesce(nullif(c.pet_name, ''), nullif(c.pet_name_en, ''), '');

    -- 실제로 값이 담긴 항목만 셈 — null·빈 문자열·빈 배열은 케이스에 쓰이지 않으므로 제외.
    -- submitted_values 가 없는 행(20260818000002 이전 제출)은 셀 수 없어 문구를 생략한다.
    if new.submitted_values is not null then
      select count(*) into cnt
      from jsonb_each(new.submitted_values) as e(k, v)
      where jsonb_typeof(v) <> 'null'
        and not (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
        and not (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0);
    else
      cnt := null;
    end if;

    body := '보호자가 정보를 입력했어요';
    if cnt is not null then
      body := body || ' · ' || cnt || '개 항목';
    end if;
    body := body || E'\n\n고객 · ' || coalesce(nullif(c.customer_name, ''), '-');
    if pet <> '' then
      body := body || E'\n동물 · ' || pet;
    end if;
    if coalesce(c.destination, '') <> '' then
      body := body || E'\n목적지 · ' || c.destination;
    end if;
    if coalesce(new.submitter_name, '') <> '' then
      body := body || E'\n\n' || new.submitter_name || ' 님이 입력했습니다.';
    end if;
    if coalesce(new.submitter_note, '') <> '' then
      body := body || E'\n비고 · ' || new.submitter_note;
    end if;

    insert into public.notifications (user_id, case_id, org_id, content)
    values (new.created_by, new.case_id, c.org_id, body);
  exception when others then
    -- best-effort: 알림 실패가 제출(UPDATE)을 막지 않도록 무시.
    null;
  end;
  return new;
end;
$$;

comment on function public.notify_share_link_submitted() is
  '공유 링크 제출(submitted_at NULL→값) 시 링크 생성 운영자에게 notifications 적재. 입력 항목 수 + org_id 포함.';

-- ─────────────────────────────────────────────────
-- 3-3. 계정 삭제 통보 — org_id 추가 (익명화·삭제 로직 동일)
-- ─────────────────────────────────────────────────
create or replace function public.process_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof      record;
  lnk       record;
  remaining int;
  body      text;
begin
  for prof in
    select user_id from public.customer_profiles
    where deletion_scheduled_at is not null
      and deletion_scheduled_at <= now() - interval '7 days'
  loop
    -- 1) 연결된 org 멤버에게 통보 (best-effort)
    begin
      for lnk in
        select l.case_id, c.org_id, c.customer_name, c.pet_name, c.destination
        from public.case_customer_links l
        join public.cases c on c.id = l.case_id
        where l.user_id = prof.user_id
      loop
        body := '고객 탈퇴 — 연결된 고객이 펫무브 계정을 삭제했습니다. 진행 중인 절차가 있으면 마무리해 주세요.';
        body := body || E'\n\n고객 · ' || coalesce(nullif(lnk.customer_name, ''), '-');
        if coalesce(lnk.pet_name, '') <> '' then
          body := body || E'\n동물 · ' || lnk.pet_name;
        end if;
        if coalesce(lnk.destination, '') <> '' then
          body := body || E'\n국가 · ' || lnk.destination;
        end if;

        insert into public.notifications (user_id, case_id, org_id, content)
        select user_id, lnk.case_id, lnk.org_id, body
        from public.memberships
        where org_id = lnk.org_id;
      end loop;
    exception when others then
      null; -- 통보 실패가 삭제를 막지 않음
    end;

    -- 2) 단독 연결 케이스만 익명화 (다른 고객이 남아있으면 보존)
    begin
      for lnk in
        select case_id from public.case_customer_links where user_id = prof.user_id
      loop
        select count(*) into remaining
        from public.case_customer_links
        where case_id = lnk.case_id and user_id <> prof.user_id;
        if remaining = 0 then
          update public.cases
          set customer_name = '(탈퇴한 사용자)',
              data = (coalesce(data, '{}'::jsonb)) - 'email' - 'phone'
          where id = lnk.case_id;
        end if;
      end loop;
    exception when others then
      null; -- 익명화 실패가 삭제를 막지 않음
    end;

    -- 3) hard delete — cascade 로 customer_profiles + case_customer_links 동시 삭제
    delete from auth.users where id = prof.user_id;
  end loop;
end;
$$;

comment on function public.process_account_deletions() is
  '유예 7일 지난 탈퇴 요청 처리 — 연결 org 멤버 notifications 통보(org_id 포함) + 단독 케이스 익명화 + auth.users hard delete. pg_cron 매일 실행.';

notify pgrst, 'reload schema';
