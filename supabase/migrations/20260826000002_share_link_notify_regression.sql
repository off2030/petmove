-- =============================================================================
-- 공유 링크 제출 알림 회귀 복구 — 옛 채팅(messages) 경로 → notifications (2026-08-26)
-- =============================================================================
-- WHY: 20260805000001 이 notify_share_link_submitted() 를 notifications 직접 insert 로
--      재작성했는데, 나중 날짜인 20260818000002 가 **08-05 이전 버전(봇 + conversations +
--      messages)을 베이스로** create or replace 하면서 저장 경로를 통째로 되돌렸다.
--      '항목 수' 문구만 새로 얹혔을 뿐 알림은 계속 옛 messages 테이블로 들어갔고,
--      알림 UI 는 notifications 만 읽으므로 **08-18 이후 모든 매직링크 제출 알림이 조용히
--      유실**됐다 (2026-08-26 홍소영/토비 — 고객은 제출했는데 담당자 알림 0건).
--      같은 파일의 notify_new_apply_case() 는 08-05 버전이 최신이라 '신규 등록 안내'만
--      정상 도착한 것도 이 설명과 맞는다.
--
--      함수 본문의 `exception when others then null`(best-effort) 이 봇 계정 조회 실패·
--      채팅 테이블 부재를 전부 삼켜, 회귀가 에러 한 줄 없이 숨어 있었다.
--
-- 이 마이그레이션이 하는 일:
--   1) notify_share_link_submitted() 를 notifications insert 로 복구 (항목 수 문구 유지)
--   2) 회귀 기간에 messages 로 새어 들어간 알림을 notifications 로 백필 (멱등)
-- =============================================================================

-- ─────────────────────────────────────────────────
-- 1. 함수 복구 — 08-05 의 notifications 경로 + 08-18 의 항목 수 문구
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
  cnt  int;
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
  '공유 링크 제출(submitted_at NULL→값) 시 링크 생성 운영자에게 notifications 적재. 입력 항목 수 포함.';

-- 트리거는 20260615000001 에서 만든 share_links_notify_submitted 를 그대로 쓴다
-- (submitted_at NULL→값 에서만 발동). 함수 본문만 교체되므로 재생성 불필요.

-- ─────────────────────────────────────────────────
-- 2. 회귀 기간 유실분 백필 — messages → notifications (멱등)
-- ─────────────────────────────────────────────────
-- 20260805000001 의 백필과 **완전히 동일한 조건·dedup**. 그때 이미 옮겨진 행은
-- not exists 에 걸려 건너뛰므로, 실제로 들어오는 건 08-18 회귀 이후 새어 들어간 알림뿐이다.
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
