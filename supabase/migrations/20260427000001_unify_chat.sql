-- Phase C: 채팅 스키마 통합 — DM 을 그룹 모델로 흡수.
-- 1:1 = 참여자 2명인 conversation. 그룹 = 3+. 동일 테이블/API.
--
-- 절차:
--   1. 기존 DM 데이터 (conversations/messages/message_reads) → group_* 로 이관 (id 보존)
--   2. 기존 DM 테이블/함수/트리거 drop
--   3. group_* 테이블 → conversations/conversation_participants/messages/message_reads 로 rename
--   4. 컬럼 group_id → conversation_id rename
--   5. is_group_member → is_conversation_participant
--   6. 트리거 함수 rename + 재연결
--   7. RLS 정책 재정의
--
-- 주의: 기존 conversations 의 id 가 보존되므로 chat-files 스토리지 path (`<convId>/...`) 가 그대로 유효.

-- ─────────────────────────────────────────────────
-- 1. DM 데이터 이관 (group_* 로 복사)
-- ─────────────────────────────────────────────────
do $$
begin
  -- conversations → group_conversations
  insert into public.group_conversations (id, name, last_message_at, created_by, created_at)
  select id, null, last_message_at, null, created_at
  from public.conversations
  on conflict (id) do nothing;

  -- user_a, user_b → group_participants
  insert into public.group_participants (group_id, user_id, joined_at)
  select id, user_a_id, created_at from public.conversations
  on conflict do nothing;
  insert into public.group_participants (group_id, user_id, joined_at)
  select id, user_b_id, created_at from public.conversations
  on conflict do nothing;

  -- messages → group_messages
  insert into public.group_messages (
    id, group_id, sender_user_id, case_id, case_label,
    content, file_url, file_name, created_at, edited_at, deleted_at
  )
  select
    id, conv_id, sender_user_id, case_id, case_label,
    content, file_url, file_name, created_at, edited_at, deleted_at
  from public.messages
  on conflict (id) do nothing;

  -- message_reads → group_message_reads
  insert into public.group_message_reads (user_id, group_id, last_read_at)
  select user_id, conv_id, last_read_at from public.message_reads
  on conflict (user_id, group_id) do update set last_read_at = excluded.last_read_at;

  -- pinned_message_id 동기화 (FK 가 group_messages 를 가리키도록 위에서 메시지 먼저 이관)
  update public.group_conversations gc
  set pinned_message_id = c.pinned_message_id
  from public.conversations c
  where gc.id = c.id and c.pinned_message_id is not null;
end $$;

-- ─────────────────────────────────────────────────
-- 2. 기존 DM 객체 drop
-- ─────────────────────────────────────────────────
-- realtime publication 에서 기존 DM 테이블 제거 — drop 이 cascade 로 빼지만 명시적으로
do $$ begin alter publication supabase_realtime drop table public.message_reads; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime drop table public.messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime drop table public.conversations; exception when others then null; end $$;

-- 테이블 drop (정책/트리거/FK 자동 제거)
drop table if exists public.message_reads cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

-- DM 트리거 함수 drop
drop function if exists public.bump_conversation_on_message() cascade;

-- ─────────────────────────────────────────────────
-- 3. group_* 정식 이름으로 rename
-- ─────────────────────────────────────────────────
alter table public.group_conversations rename to conversations;
alter table public.group_participants rename to conversation_participants;
alter table public.group_messages rename to messages;
alter table public.group_message_reads rename to message_reads;

-- 컬럼 rename: group_id → conversation_id
alter table public.conversation_participants rename column group_id to conversation_id;
alter table public.messages rename column group_id to conversation_id;
alter table public.message_reads rename column group_id to conversation_id;

-- 인덱스 rename — cosmetic
alter index if exists group_participants_user_idx rename to conversation_participants_user_idx;
alter index if exists group_messages_group_created_idx rename to messages_conversation_created_idx;
alter index if exists group_messages_case_idx rename to messages_case_idx;
alter index if exists group_messages_sender_idx rename to messages_sender_idx;

-- ─────────────────────────────────────────────────
-- 4. 헬퍼 함수 — is_group_member → is_conversation_participant
-- ─────────────────────────────────────────────────
drop function if exists public.is_group_member(uuid) cascade;

create or replace function public.is_conversation_participant(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = c_id and user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────
-- 5. 트리거 함수 rename + 재연결
-- ─────────────────────────────────────────────────
drop function if exists public.bump_group_conversation_on_message() cascade;

create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-- ─────────────────────────────────────────────────
-- 6. RLS 정책 재정의
-- ─────────────────────────────────────────────────

-- conversations
drop policy if exists group_conversations_select on public.conversations;
drop policy if exists group_conversations_insert on public.conversations;
drop policy if exists group_conversations_update on public.conversations;
drop policy if exists group_conversations_super_admin_all on public.conversations;

create policy conversations_select on public.conversations
  for select using (
    public.is_super_admin() or public.is_conversation_participant(id)
  );

create policy conversations_insert on public.conversations
  for insert with check (auth.uid() = created_by);

create policy conversations_update on public.conversations
  for update
  using (public.is_conversation_participant(id))
  with check (public.is_conversation_participant(id));

create policy conversations_super_admin_all on public.conversations
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- conversation_participants
drop policy if exists group_participants_select on public.conversation_participants;
drop policy if exists group_participants_insert on public.conversation_participants;
drop policy if exists group_participants_delete on public.conversation_participants;

create policy conversation_participants_select on public.conversation_participants
  for select using (
    public.is_super_admin() or public.is_conversation_participant(conversation_id)
  );

create policy conversation_participants_insert on public.conversation_participants
  for insert with check (public.is_conversation_participant(conversation_id));

create policy conversation_participants_delete on public.conversation_participants
  for delete using (
    public.is_super_admin() or public.is_conversation_participant(conversation_id)
  );

-- messages
drop policy if exists group_messages_select on public.messages;
drop policy if exists group_messages_insert on public.messages;
drop policy if exists group_messages_update_own on public.messages;

create policy messages_select on public.messages
  for select using (
    public.is_super_admin() or public.is_conversation_participant(conversation_id)
  );

create policy messages_insert on public.messages
  for insert with check (
    sender_user_id = auth.uid() and public.is_conversation_participant(conversation_id)
  );

create policy messages_update_own on public.messages
  for update
  using (sender_user_id = auth.uid())
  with check (sender_user_id = auth.uid());

-- message_reads
drop policy if exists group_message_reads_select on public.message_reads;
drop policy if exists group_message_reads_insert_self on public.message_reads;
drop policy if exists group_message_reads_update_self on public.message_reads;
drop policy if exists group_message_reads_delete_self on public.message_reads;

create policy message_reads_select on public.message_reads
  for select using (
    public.is_super_admin() or public.is_conversation_participant(conversation_id)
  );

create policy message_reads_insert_self on public.message_reads
  for insert with check (user_id = auth.uid());

create policy message_reads_update_self on public.message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy message_reads_delete_self on public.message_reads
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- 7. 코멘트
-- ─────────────────────────────────────────────────
comment on table public.conversations is '통합 채팅방. 참여자 2명=DM, 3+=그룹.';
comment on table public.conversation_participants is '대화방 참여자. 누구나 추가/추방 가능 (멤버 권한).';
comment on table public.messages is '대화방 메시지. 1:1/그룹 공통.';
comment on table public.message_reads is '사용자별 대화방별 마지막 읽은 시각.';
