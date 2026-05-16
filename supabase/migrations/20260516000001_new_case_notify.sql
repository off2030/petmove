-- 신청폼 케이스 출처 표시 + 신규 신청 시 펫무브워크 봇 알림.
--
-- WHY: 고객이 펫무브(portal) 공개 신청폼을 제출하면 운영자가 즉시 알 수 있도록
--      해당 org 멤버 각자의 시스템 대화방에 펫무브워크 봇 메시지를 1건 남긴다.
--      운영자가 직접 만든 케이스(source='manual')는 알림 대상이 아니다.
-- 알림 발송 실패가 신청 INSERT 를 롤백시키지 않도록 트리거 본문은 best-effort.

-- ─────────────────────────────────────────────────
-- 1. 케이스 출처 컬럼
-- ─────────────────────────────────────────────────
alter table public.cases
  add column if not exists source text not null default 'manual';

comment on column public.cases.source is
  'manual=운영자 직접 생성, apply_form=펫무브 공개 신청폼 제출.';

-- ─────────────────────────────────────────────────
-- 2. 신규 신청 알림 트리거 함수
-- ─────────────────────────────────────────────────
create or replace function public.notify_new_apply_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bot_id  uuid;
  conv_id uuid;
  mem     record;
  body    text;
begin
  begin
    -- 봇 사용자 — 없으면 알림 생략 (super-admin 봇 설정에서 생성됨).
    select id into bot_id from public.profiles where email = 'bot@petmove.work' limit 1;
    if bot_id is null then
      return new;
    end if;

    body := '새 신청 접수 — 고객이 신청폼을 제출했습니다.';
    body := body || E'\n\n고객 · ' || coalesce(nullif(new.customer_name, ''), '-');
    if coalesce(new.pet_name, '') <> '' then
      body := body || E'\n동물 · ' || new.pet_name;
    end if;
    if coalesce(new.destination, '') <> '' then
      body := body || E'\n국가 · ' || new.destination;
    end if;

    -- org 멤버 각자의 시스템 대화방(없으면 생성)에 봇 메시지 적재.
    for mem in
      select user_id from public.memberships where org_id = new.org_id
    loop
      select id into conv_id
      from public.conversations
      where kind = 'system' and created_by = mem.user_id
      limit 1;

      if conv_id is null then
        insert into public.conversations (kind, created_by, name)
        values ('system', mem.user_id, null)
        returning id into conv_id;
      end if;

      insert into public.conversation_participants (conversation_id, user_id)
      values (conv_id, mem.user_id), (conv_id, bot_id)
      on conflict (conversation_id, user_id) do nothing;

      insert into public.messages (conversation_id, sender_user_id, case_id, content)
      values (conv_id, bot_id, new.id, body);
    end loop;
  exception when others then
    -- best-effort: 알림 실패가 신청 접수(INSERT)를 막지 않도록 무시.
    null;
  end;
  return new;
end;
$$;

comment on function public.notify_new_apply_case() is
  '신청폼(source=apply_form) 케이스 INSERT 시 org 멤버에게 펫무브워크 봇 메시지 발송.';

-- ─────────────────────────────────────────────────
-- 3. 트리거 — apply_form 케이스 INSERT 에만 발동
-- ─────────────────────────────────────────────────
drop trigger if exists cases_notify_new_apply on public.cases;
create trigger cases_notify_new_apply
  after insert on public.cases
  for each row
  when (new.source = 'apply_form')
  execute function public.notify_new_apply_case();
