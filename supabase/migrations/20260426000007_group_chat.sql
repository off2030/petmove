-- Phase B: 그룹 채팅 (3+ 인원, 분리형)
-- 기존 1:1 conversations / messages / message_reads 와 별도 테이블 사용.
-- 이름은 옵션 (50자 제한, 비면 멤버 이름 자동 표시 — UI 처리).
-- 멤버 누구나 멤버 추가/추방, 이름 변경, 공지 등록 가능.

-- ─────────────────────────────────────────────────
-- 1. group_conversations
-- ─────────────────────────────────────────────────
create table if not exists public.group_conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  pinned_message_id uuid,  -- FK 는 group_messages 생성 후 별도 alter
  last_message_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint group_conversations_name_len check (name is null or char_length(name) <= 50)
);

-- ─────────────────────────────────────────────────
-- 2. group_participants
-- ─────────────────────────────────────────────────
create table if not exists public.group_participants (
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_participants_user_idx
  on public.group_participants (user_id);

-- ─────────────────────────────────────────────────
-- 3. group_messages
-- ─────────────────────────────────────────────────
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  case_label text,
  content text,
  file_url text,
  file_name text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint group_messages_has_content check (content is not null or file_url is not null)
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);
create index if not exists group_messages_case_idx
  on public.group_messages (case_id) where case_id is not null;
create index if not exists group_messages_sender_idx
  on public.group_messages (sender_user_id);

-- pinned_message_id FK — group_messages 생성 후 추가 (순환 참조 회피)
do $$
begin
  alter table public.group_conversations
    add constraint group_conversations_pinned_message_fk
    foreign key (pinned_message_id) references public.group_messages(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────
-- 4. group_message_reads
-- ─────────────────────────────────────────────────
create table if not exists public.group_message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

-- ─────────────────────────────────────────────────
-- 5. 멤버십 헬퍼 — RLS 에서 EXISTS 대신 사용 (성능/가독성)
-- ─────────────────────────────────────────────────
create or replace function public.is_group_member(g_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_participants
    where group_id = g_id and user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────
-- 6. last_message_at 트리거
-- ─────────────────────────────────────────────────
create or replace function public.bump_group_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_conversations
  set last_message_at = now()
  where id = new.group_id;
  return new;
end;
$$;

drop trigger if exists group_messages_bump_conversation on public.group_messages;
create trigger group_messages_bump_conversation
  after insert on public.group_messages
  for each row execute function public.bump_group_conversation_on_message();

-- ─────────────────────────────────────────────────
-- 7. RLS — group_conversations
-- ─────────────────────────────────────────────────
alter table public.group_conversations enable row level security;

drop policy if exists group_conversations_select on public.group_conversations;
create policy group_conversations_select on public.group_conversations
  for select using (
    public.is_super_admin()
    or public.is_group_member(id)
  );

-- 본인이 created_by 인 row 만 INSERT — 멤버 부트스트랩은 server action 의 admin client 가 처리
drop policy if exists group_conversations_insert on public.group_conversations;
create policy group_conversations_insert on public.group_conversations
  for insert with check (auth.uid() = created_by);

-- 멤버 누구나 이름/공지 변경
drop policy if exists group_conversations_update on public.group_conversations;
create policy group_conversations_update on public.group_conversations
  for update
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

drop policy if exists group_conversations_super_admin_all on public.group_conversations;
create policy group_conversations_super_admin_all on public.group_conversations
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- 8. RLS — group_participants
-- ─────────────────────────────────────────────────
alter table public.group_participants enable row level security;

drop policy if exists group_participants_select on public.group_participants;
create policy group_participants_select on public.group_participants
  for select using (
    public.is_super_admin()
    or public.is_group_member(group_id)
  );

-- 멤버만 새 멤버 추가 가능 (최초 생성은 server action 의 admin client 로 부트스트랩)
drop policy if exists group_participants_insert on public.group_participants;
create policy group_participants_insert on public.group_participants
  for insert with check (public.is_group_member(group_id));

-- 멤버 누구나 추방 (본인 leave 포함). super_admin 전체.
drop policy if exists group_participants_delete on public.group_participants;
create policy group_participants_delete on public.group_participants
  for delete using (
    public.is_super_admin()
    or public.is_group_member(group_id)
  );

-- ─────────────────────────────────────────────────
-- 9. RLS — group_messages
-- ─────────────────────────────────────────────────
alter table public.group_messages enable row level security;

drop policy if exists group_messages_select on public.group_messages;
create policy group_messages_select on public.group_messages
  for select using (
    public.is_super_admin()
    or public.is_group_member(group_id)
  );

drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_insert on public.group_messages
  for insert with check (
    sender_user_id = auth.uid()
    and public.is_group_member(group_id)
  );

drop policy if exists group_messages_update_own on public.group_messages;
create policy group_messages_update_own on public.group_messages
  for update
  using (sender_user_id = auth.uid())
  with check (sender_user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- 10. RLS — group_message_reads
-- (DM 쪽 message_reads 와 동일 패턴: 참여자 SELECT, 본인만 write)
-- ─────────────────────────────────────────────────
alter table public.group_message_reads enable row level security;

drop policy if exists group_message_reads_select on public.group_message_reads;
create policy group_message_reads_select on public.group_message_reads
  for select using (
    public.is_super_admin()
    or public.is_group_member(group_id)
  );

drop policy if exists group_message_reads_insert_self on public.group_message_reads;
create policy group_message_reads_insert_self on public.group_message_reads
  for insert with check (user_id = auth.uid());

drop policy if exists group_message_reads_update_self on public.group_message_reads;
create policy group_message_reads_update_self on public.group_message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists group_message_reads_delete_self on public.group_message_reads;
create policy group_message_reads_delete_self on public.group_message_reads
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- 11. Realtime publication
-- ─────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.group_conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_participants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_message_reads;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────
-- 12. 코멘트
-- ─────────────────────────────────────────────────
comment on table public.group_conversations is 'Phase B: 그룹 채팅방 (3+ 인원). name 옵션, 비면 UI 에서 멤버 이름 자동 표시.';
comment on table public.group_participants is '그룹 멤버. 멤버 누구나 추가/추방, 본인 leave 가능.';
comment on table public.group_messages is '그룹 메시지. case_id/case_label 로 동물 태그 가능.';
comment on table public.group_message_reads is '사용자별 그룹별 마지막 읽은 시각 (안 읽은 카운트용).';
