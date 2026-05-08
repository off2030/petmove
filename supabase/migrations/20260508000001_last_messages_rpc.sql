-- listMyConversations 가 한 번에 모든 conv 의 last message + unread count 를
-- 가져올 때, PostgREST 만으로는 conv 별 집계가 안 돼서 conv 전체 메시지를
-- 가져온 뒤 client 측에서 추림. 누적 사용자에서 N×M 페이로드 폭증.
--
-- 본 함수는 conv 별로 (1) last message 1건 + (2) 본인 기준 unread count 를
-- 한 row 로 묶어 반환. PostgREST RPC 로 노출.
-- security invoker — 호출자의 RLS 가 그대로 적용 (messages_select 정책 통과한 행만).

drop function if exists public.last_messages_for_conversations(uuid[]);

create or replace function public.conversation_summaries(
  p_conv_ids uuid[]
)
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_sender_user_id uuid,
  last_content text,
  last_file_url text,
  last_created_at timestamptz,
  unread_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with last_msgs as (
    select distinct on (m.conversation_id)
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.content,
      m.file_url,
      m.created_at
    from public.messages m
    where m.conversation_id = any(p_conv_ids)
      and m.deleted_at is null
    order by m.conversation_id, m.created_at desc
  ),
  reads as (
    select conversation_id, last_read_at
    from public.message_reads
    where user_id = auth.uid()
      and conversation_id = any(p_conv_ids)
  ),
  unread as (
    select m.conversation_id, count(*)::int as cnt
    from public.messages m
    left join reads r on r.conversation_id = m.conversation_id
    where m.conversation_id = any(p_conv_ids)
      and m.deleted_at is null
      and m.sender_user_id is distinct from auth.uid()
      and (r.last_read_at is null or m.created_at > r.last_read_at)
    group by m.conversation_id
  )
  select
    lm.conversation_id,
    lm.id as last_message_id,
    lm.sender_user_id as last_sender_user_id,
    lm.content as last_content,
    lm.file_url as last_file_url,
    lm.created_at as last_created_at,
    coalesce(u.cnt, 0) as unread_count
  from last_msgs lm
  left join unread u on u.conversation_id = lm.conversation_id
$$;

-- PostgREST schema cache reload — 새 RPC 가 즉시 노출되도록.
notify pgrst, 'reload schema';
