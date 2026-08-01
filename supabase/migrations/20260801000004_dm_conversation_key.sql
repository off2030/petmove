-- 1:1 DM 동시 생성 race 수정 — dm_key 로 DB 레벨 유일성 보장 (성능 audit P2#17).
--
-- 문제: getOrCreateDM 이 "SELECT 탐색 3회 → 없으면 INSERT" 비원자 구조라
--       같은 쌍이 동시에 호출하면 중복 DM conversation 이 2개 생길 수 있었다.
--
-- 해결: conversations.dm_key = 두 참가자 uuid 를 정렬해 ':' 로 이은 텍스트.
--       - DM(kind='normal', 참가자 2명)에만 값을 넣고, 그룹/시스템 대화방은 null 유지.
--       - unique index 는 일반(non-partial)으로 — null 은 서로 충돌하지 않으므로
--         그룹/시스템 대화방 무제한 허용 + PostgREST upsert 의 on_conflict(dm_key) 추론 가능
--         (partial index 는 PostgREST on_conflict 로 추론 불가).
--       - 앱은 upsert(ignoreDuplicates) → 충돌 시 재SELECT 로 원자화.
--
-- 주의: 시스템 대화방(kind='system')도 참가자가 정확히 2명(유저+봇)이므로
--       backfill 은 반드시 kind='normal' 로 한정한다.

-- ─────────────────────────────────────────────────
-- 1. 컬럼 추가
-- ─────────────────────────────────────────────────
alter table public.conversations
  add column if not exists dm_key text;

comment on column public.conversations.dm_key is
  '1:1 DM 식별 키 — 두 참가자 uuid 를 오름차순 정렬해 '':'' 로 연결. DM(kind=normal, 참가자 2명)에만 설정, 그룹/시스템은 null. unique index 로 같은 쌍의 중복 DM 생성을 DB 레벨에서 차단.';

-- ─────────────────────────────────────────────────
-- 2. backfill — kind='normal' + 참가자 정확히 2명인 대화방
--    (uuid 타입 min/max 비교 = 바이트 순서, locale 무관 · TS 쪽 문자열 sort 와 일치)
-- ─────────────────────────────────────────────────
with pair as (
  select
    cp.conversation_id,
    -- min/max(uuid) 집계는 없음 — 캐스팅해 텍스트 순서로. 캐노니컬 소문자 uuid 텍스트라
    -- TS 쪽 키 생성([a,b].sort() — chat.ts)과 동일한 사전식 순서.
    min(cp.user_id::text) as user_lo,
    max(cp.user_id::text) as user_hi,
    count(*) as n
  from public.conversation_participants cp
  group by cp.conversation_id
)
update public.conversations c
set dm_key = p.user_lo::text || ':' || p.user_hi::text
from pair p
where p.conversation_id = c.id
  and p.n = 2
  and c.kind = 'normal'
  and c.dm_key is null;

-- ─────────────────────────────────────────────────
-- 3. 기존 중복 DM 병합 — 같은 dm_key 가 2개 이상이면 가장 오래된 방을 남기고
--    메시지·읽음 커서를 이전한 뒤 나머지 삭제 (unique index 생성 전 필수 정리).
--    (2026-07-09 사람 대화 전체 삭제 이후라 실제 중복은 거의 없을 것 — 방어적 처리)
-- ─────────────────────────────────────────────────
do $$
declare
  dup record;
begin
  for dup in
    select
      dm_key,
      (array_agg(id order by created_at asc, id asc))[1] as keep_id,
      array_agg(id order by created_at asc, id asc) as ids
    from public.conversations
    where dm_key is not null
    group by dm_key
    having count(*) > 1
  loop
    -- 메시지 이전 (messages.conversation_id FK — 단순 재지정)
    update public.messages
    set conversation_id = dup.keep_id
    where conversation_id = any(dup.ids)
      and conversation_id <> dup.keep_id;

    -- 읽음 커서 병합 — PK(user_id, conversation_id) 충돌 시 더 최근 시각 유지
    insert into public.message_reads (user_id, conversation_id, last_read_at)
    select user_id, dup.keep_id, max(last_read_at)
    from public.message_reads
    where conversation_id = any(dup.ids)
      and conversation_id <> dup.keep_id
    group by user_id
    on conflict (user_id, conversation_id) do update
      set last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at);

    -- 남는 방의 last_message_at 재계산
    update public.conversations c
    set last_message_at = (
      select max(m.created_at) from public.messages m where m.conversation_id = dup.keep_id
    )
    where c.id = dup.keep_id;

    -- 중복 방 삭제 — participants/reads 는 on delete cascade 로 정리.
    -- (메시지는 위에서 이미 이전됐으므로 cascade 삭제 대상 없음.
    --  첨부 blob(chat-files/<convId>/)은 고아로 남지만 무해 — 20260709000002 와 동일 정책)
    delete from public.conversations
    where id = any(dup.ids)
      and id <> dup.keep_id;
  end loop;
end $$;

-- ─────────────────────────────────────────────────
-- 4. unique index — null 은 충돌하지 않으므로 non-partial 로 생성
--    (getOrCreateDM 의 dm_key 조회 인덱스 역할 겸용)
-- ─────────────────────────────────────────────────
create unique index if not exists conversations_dm_key_unique
  on public.conversations (dm_key);

-- ─────────────────────────────────────────────────
-- 5. 방어 트리거 — DM 에 세 번째 참가자가 추가되면 더 이상 DM 이 아니므로
--    dm_key 를 해제해 그룹으로 강등 (같은 쌍이 나중에 새 DM 을 만들 수 있게).
--    현재 UI 에는 DM 멤버 추가 경로가 없지만 addParticipant 액션이 남아 있어 방어.
-- ─────────────────────────────────────────────────
create or replace function public.clear_dm_key_on_extra_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations c
  set dm_key = null
  where c.id = new.conversation_id
    and c.dm_key is not null
    and (
      select count(*) from public.conversation_participants
      where conversation_id = new.conversation_id
    ) > 2;
  return new;
end;
$$;

drop trigger if exists conversation_participants_clear_dm_key on public.conversation_participants;
create trigger conversation_participants_clear_dm_key
  after insert on public.conversation_participants
  for each row execute function public.clear_dm_key_on_extra_participant();
