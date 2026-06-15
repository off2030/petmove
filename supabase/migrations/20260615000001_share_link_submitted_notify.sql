-- 보호자(고객)가 공유 링크로 정보를 제출하면 운영자에게 알림.
--
-- WHY: 보호자가 매직링크(/share/[token])로 정보를 입력하면 case_share_links.submitted_at
--      이 채워지지만, 그 사실이 운영자에게 전달되지 않아 입력이 들어온 줄 모른다.
--      신규 신청 알림(notify_new_apply_case)과 동일한 패턴으로, 링크를 발급한 운영자
--      (created_by) 의 시스템 대화방에 펫무브워크 봇 메시지를 1건 남긴다.
-- 대상은 org 전원이 아니라 링크 생성자 1인 — 링크를 보낸 본인이 입력 결과를 받는 흐름.
-- 알림 발송 실패가 제출(UPDATE)을 롤백시키지 않도록 트리거 본문은 best-effort.

create or replace function public.notify_share_link_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bot_id  uuid;
  conv_id uuid;
  c       record;
  pet     text;
  body    text;
begin
  begin
    -- 봇 사용자 — 없으면 알림 생략 (super-admin 봇 설정에서 생성됨).
    select id into bot_id from public.profiles where email = 'bot@petmove.work' limit 1;
    if bot_id is null then
      return new;
    end if;

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

    -- 링크 생성 운영자의 시스템 대화방(없으면 생성)에 봇 메시지 적재.
    select id into conv_id
    from public.conversations
    where kind = 'system' and created_by = new.created_by
    limit 1;

    if conv_id is null then
      insert into public.conversations (kind, created_by, name)
      values ('system', new.created_by, null)
      returning id into conv_id;
    end if;

    insert into public.conversation_participants (conversation_id, user_id)
    values (conv_id, new.created_by), (conv_id, bot_id)
    on conflict (conversation_id, user_id) do nothing;

    insert into public.messages (conversation_id, sender_user_id, case_id, content)
    values (conv_id, bot_id, new.case_id, body);
  exception when others then
    -- best-effort: 알림 실패가 제출(UPDATE)을 막지 않도록 무시.
    null;
  end;
  return new;
end;
$$;

comment on function public.notify_share_link_submitted() is
  '공유 링크 제출(submitted_at NULL→값) 시 링크 생성 운영자에게 펫무브워크 봇 메시지 발송.';

-- 트리거 — submitted_at 이 NULL 에서 값으로 바뀌는 "최초 제출" 순간에만 발동.
-- revoke(revoked_at) 나 제출 롤백(값→NULL)에는 발동하지 않는다.
drop trigger if exists share_links_notify_submitted on public.case_share_links;
create trigger share_links_notify_submitted
  after update on public.case_share_links
  for each row
  when (old.submitted_at is null and new.submitted_at is not null)
  execute function public.notify_share_link_submitted();
