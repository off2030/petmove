-- 매직링크 제출 원문 보존 + 담당자 알림에 입력 항목 수 표시.
--
-- WHY: 보호자가 /share 폼으로 무엇을 입력했는지가 **어디에도 남지 않았다**.
--      · case_share_links 에는 submitted_at·submitter_name·submitter_note 뿐 — 값은 없음
--      · case_history 는 케이스에 '반영된' 차이만 기록 — 화이트리스트 밖 키나 빈 값은 흔적 0
--      · 고객 브라우저의 임시 저장(localStorage)은 제출 성공 시 삭제
--      · Sentry 는 실패했을 때만, 그것도 에러 문구만
--      그래서 "고객은 보냈다는데 케이스는 그대로"인 문의가 오면 무엇을 보냈는지 확인할
--      방법이 없어 고객에게 다시 물어보는 것 말고는 답이 없었다(2026-08-18 배유/추어).
--
-- 저장 값은 화이트리스트 필터링 **전** 원문이다. 필터에 걸려 반영되지 않은 입력이야말로
-- 추적하려는 대상이라, 걸러낸 뒤를 저장하면 목적을 잃는다.
--
-- 개인정보: 같은 테이블·같은 RLS(조직 멤버만) 안에 머문다. 링크 자체가 이미 그 케이스의
-- 보호자 입력을 담는 그릇이라 노출 범위는 넓어지지 않는다. 보존 기간은 링크 행의 수명과
-- 동일(케이스 삭제 시 cascade).
alter table public.case_share_links
  add column if not exists submitted_values jsonb;

comment on column public.case_share_links.submitted_values is
  '보호자가 /share 폼에서 제출한 원문 payload(화이트리스트 필터 전). 반영 실패·누락 추적용.';

-- 알림 문구에 입력 항목 수를 덧붙인다. 지금까지는 저장 결과와 무관하게 항상 같은 문장이라,
-- 담당자는 알림만 보고 실제로 뭐가 들어왔는지(혹은 아무것도 안 들어왔는지) 알 수 없었다.
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
  cnt     int;
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

    -- 실제로 값이 담긴 항목만 셈 — null·빈 문자열·빈 배열은 케이스에 쓰이지 않으므로 제외.
    -- submitted_values 가 없는 행(이 마이그 이전 제출)은 셀 수 없어 문구를 생략한다.
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
  '공유 링크 제출(submitted_at NULL→값) 시 링크 생성 운영자에게 펫무브워크 봇 메시지 발송. 입력 항목 수 포함.';
