-- 신규 신청 알림 문구 변경.
--   제목 '새 신청 접수 — 고객이 신청폼을 제출했습니다.' → '신규 등록 안내'
--   필드 라벨 '국가' → '목적지'
-- (20260516000001 의 notify_new_apply_case 본문만 교체 — 로직/트리거 동일)

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

    body := '신규 등록 안내';
    body := body || E'\n\n고객 · ' || coalesce(nullif(new.customer_name, ''), '-');
    if coalesce(new.pet_name, '') <> '' then
      body := body || E'\n동물 · ' || new.pet_name;
    end if;
    if coalesce(new.destination, '') <> '' then
      body := body || E'\n목적지 · ' || new.destination;
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
