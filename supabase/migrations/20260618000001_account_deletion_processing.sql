-- =============================================================================
-- 계정 삭제 처리 (유예 만료 건) — 매일 pg_cron 으로 실행
-- =============================================================================
-- 20260608000001 에서 customer_profiles.deletion_scheduled_at 로 "삭제 예약(7일 유예)"
-- 까지만 만들어졌고, 실제 처리(통보·익명화·삭제)를 수행하는 장치가 없었음. 이 마이그레이션이
-- 그 처리기다. (애플 앱스토어의 '계정 삭제 실제 동작' 요건 + 처리방침의 파기 약속 이행.)
--
-- 처리 순서 (유예 7일 지난 customer_profiles 각각):
--   1) 통보(best-effort): 그 고객의 케이스가 연결된 org 멤버에게 펫무브워크 봇 메시지.
--      경로(apply_form/manual) 무관 — case_customer_links '연결' 기준. 연결 없으면 통보 생략.
--   2) 익명화: 그 고객이 "단독으로" 연결된 케이스만 customer_name + data.email/phone 제거.
--      가족 등 다른 고객이 아직 연결돼 있는 케이스는 보존(그들이 계속 사용).
--   3) hard delete: auth.users 삭제 → cascade 로 customer_profiles + case_customer_links 삭제.
--
-- 안전장치:
--   - 유예 미도래 건은 제외(<= now()-7d 만).
--   - 통보·익명화 실패가 삭제를 막지 않도록 각 단계 best-effort(예외 무시).
--   - 되돌릴 수 없음. 실제 삭제 전 public.pending_account_deletions() 로 대상 미리 확인 가능.
-- =============================================================================

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────
-- 읽기 전용 미리보기 — 지금 실행 시 삭제될 대상 (실제 삭제 전 확인용)
-- ─────────────────────────────────────────────────
create or replace function public.pending_account_deletions()
returns table (user_id uuid, scheduled_at timestamptz, linked_cases int)
language sql
security definer
set search_path = public
as $$
  select cp.user_id,
         cp.deletion_scheduled_at,
         (select count(*) from public.case_customer_links l where l.user_id = cp.user_id)::int
  from public.customer_profiles cp
  where cp.deletion_scheduled_at is not null
    and cp.deletion_scheduled_at <= now() - interval '7 days';
$$;

-- ─────────────────────────────────────────────────
-- 처리기 본체
-- ─────────────────────────────────────────────────
create or replace function public.process_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof      record;
  bot_id    uuid;
  lnk       record;
  mem       record;
  conv_id   uuid;
  remaining int;
  body      text;
begin
  select id into bot_id from public.profiles where email = 'bot@petmove.work' limit 1;

  for prof in
    select user_id from public.customer_profiles
    where deletion_scheduled_at is not null
      and deletion_scheduled_at <= now() - interval '7 days'
  loop
    -- 1) 연결된 org 멤버에게 봇 통보 (best-effort)
    if bot_id is not null then
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

          for mem in
            select user_id from public.memberships where org_id = lnk.org_id
          loop
            select id into conv_id from public.conversations
            where kind = 'system' and created_by = mem.user_id limit 1;
            if conv_id is null then
              insert into public.conversations (kind, created_by, name)
              values ('system', mem.user_id, null) returning id into conv_id;
            end if;
            insert into public.conversation_participants (conversation_id, user_id)
            values (conv_id, mem.user_id), (conv_id, bot_id)
            on conflict (conversation_id, user_id) do nothing;
            insert into public.messages (conversation_id, sender_user_id, case_id, content)
            values (conv_id, bot_id, lnk.case_id, body);
          end loop;
        end loop;
      exception when others then
        null; -- 통보 실패가 삭제를 막지 않음
      end;
    end if;

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
  '유예 7일 지난 탈퇴 요청 처리 — 연결 org 봇 통보 + 단독 케이스 익명화 + auth.users hard delete. pg_cron 매일 실행.';

-- ─────────────────────────────────────────────────
-- 스케줄 — 매일 1회 (UTC 18:00 = KST 03:00). 재실행 시 중복 방지 위해 먼저 unschedule.
-- ─────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule('process-account-deletions');
exception when others then
  null;
end $$;

select cron.schedule(
  'process-account-deletions',
  '0 18 * * *',
  $$ select public.process_account_deletions(); $$
);
