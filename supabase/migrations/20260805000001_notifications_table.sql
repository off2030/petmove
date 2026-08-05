-- =============================================================================
-- 평범한 알림 테이블 — 채팅 유산(system 대화방 + 봇 발신자) 대체 (2026-08-05)
-- =============================================================================
-- WHY: 메시지 기능 삭제(20260709000002) 후에도 알림이 conversations/messages/
--      conversation_participants + 봇 계정(bot@petmove.work) 위에서 돌아갔다.
--      사람 간 대화가 없으니 "발신자·대화방" 모델은 전부 군더더기 — 받는 사람·내용·
--      읽음 여부만 있는 notifications 테이블로 단순화한다.
--
-- 이 마이그레이션이 하는 일:
--   1) notifications 테이블 + RLS + realtime publication 등록
--   2) 기존 system 대화방 메시지 → notifications 백필 (읽음 상태 보존, 멱등)
--   3) DB 쪽 알림 발신 3종을 notifications 직접 insert 로 재작성
--      (신규 신청 / 공유 링크 제출 / 계정 삭제 처리)
--
-- 옛 chat 테이블·봇 계정·conversation_summaries RPC 의 drop 은 하지 않는다 —
-- 새 알림이 라이브에서 정상 동작 확인된 뒤 별도 마이그레이션으로 정리(phase 5).
-- =============================================================================

-- ─────────────────────────────────────────────────
-- 1. notifications 테이블
-- ─────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- 케이스 삭제 시 알림은 남기되 링크만 끊는다 (set null).
  case_id    uuid references public.cases (id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

comment on table public.notifications is
  '사용자별 시스템 알림 — 검증 실패·신규 신청·공유링크 제출·문의 등. 발신자 개념 없음(구 봇 대체).';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- RLS — 본인 것만 읽기·읽음처리. insert 는 security definer 트리거/서비스 롤 전용
-- (사용자 스스로 알림을 만들 일이 없으므로 insert/delete 정책 없음).
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- realtime — 클라이언트가 새 알림을 즉시 수신 (RLS 로 본인 행만 전달됨).
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ─────────────────────────────────────────────────
-- 2. 기존 알림 백필 — system 대화방 메시지 이관 (멱등)
-- ─────────────────────────────────────────────────
-- 수신자 = 대화방 소유자(conversations.created_by). 읽음 = 소유자의 message_reads
-- last_read_at 이 메시지 시각 이후면 그 시각을 read_at 으로.
insert into public.notifications (user_id, case_id, content, created_at, read_at)
select c.created_by,
       m.case_id,
       m.content,
       m.created_at,
       case when r.last_read_at >= m.created_at then r.last_read_at else null end
from public.messages m
join public.conversations c
  on c.id = m.conversation_id and c.kind = 'system'
left join public.message_reads r
  on r.conversation_id = c.id and r.user_id = c.created_by
where m.deleted_at is null
  and m.content is not null
  and c.created_by is not null
  and not exists (
    select 1 from public.notifications n
    where n.user_id = c.created_by
      and n.created_at = m.created_at
      and n.content = m.content
  );

-- ─────────────────────────────────────────────────
-- 3-1. 신규 신청 알림 — notifications 직접 insert (봇·대화방 제거)
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

    insert into public.notifications (user_id, case_id, content)
    select user_id, new.id, body
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
  '신청폼(source=apply_form) 케이스 INSERT 시 org 멤버 전원에게 notifications 적재.';

-- ─────────────────────────────────────────────────
-- 3-2. 공유 링크 제출 알림
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
  body text;
begin
  begin
    -- 링크 생성자 = 알림 수신자. 없으면 보낼 곳이 없으므로 생략.
    if new.created_by is null then
      return new;
    end if;

    select customer_name, pet_name, pet_name_en, destination
      into c
      from public.cases
      where id = new.case_id
      limit 1;

    pet := coalesce(nullif(c.pet_name, ''), nullif(c.pet_name_en, ''), '');

    body := '보호자가 정보를 입력했어요';
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

    insert into public.notifications (user_id, case_id, content)
    values (new.created_by, new.case_id, body);
  exception when others then
    -- best-effort: 알림 실패가 제출(UPDATE)을 막지 않도록 무시.
    null;
  end;
  return new;
end;
$$;

comment on function public.notify_share_link_submitted() is
  '공유 링크 제출(submitted_at NULL→값) 시 링크 생성 운영자에게 notifications 적재.';

-- ─────────────────────────────────────────────────
-- 3-3. 계정 삭제 처리 — 통보 경로만 notifications 로 교체 (익명화·삭제 로직 동일)
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

        insert into public.notifications (user_id, case_id, content)
        select user_id, lnk.case_id, body
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
  '유예 7일 지난 탈퇴 요청 처리 — 연결 org 멤버 notifications 통보 + 단독 케이스 익명화 + auth.users hard delete. pg_cron 매일 실행.';
