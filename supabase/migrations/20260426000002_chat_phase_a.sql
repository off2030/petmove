-- Phase A: 1:1 DM (개인 ↔ 개인)
-- 채널 = 두 사용자 짝 (user_pair). 같은 조직이든 외부 조직이든 동일 흐름.
-- 검색 노출 제어:
--   organizations.dm_visible (admin/owner 만 변경) — 외부 조직에 우리 조직 노출
--   profiles.dm_visible (각 개인) — 본인 검색 노출 (같은 조직 내부도 적용)
--
-- 이 파일은 이전 org_pair 모델을 rollback 한 후 새 DM 스키마를 만든다.
-- Seoul 에서 한 번 더 실행하면 기존 객체 drop 후 재생성 (idempotent).

-- ─────────────────────────────────────────────────
-- 0. rollback — 이전 org_pair 모델의 객체 정리
-- ─────────────────────────────────────────────────
-- 테이블 먼저 drop — 의존 정책/트리거가 함께 제거됨
drop table if exists public.message_reads cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
-- 함수 drop — 이제 dependent 없음
drop function if exists public.bump_conversation_on_message() cascade;
drop function if exists public.touch_conversations_updated_at() cascade;
drop function if exists public.is_conversation_accessible(uuid) cascade;

-- ─────────────────────────────────────────────────
-- 1. conversations: 1:1 DM 채널 (정렬된 두 user_id)
-- ─────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conversations_users_distinct check (user_a_id <> user_b_id),
  constraint conversations_users_sorted check (user_a_id < user_b_id),
  constraint conversations_user_pair_unique unique (user_a_id, user_b_id)
);

create index conversations_user_a_idx
  on public.conversations (user_a_id, last_message_at desc nulls last);
create index conversations_user_b_idx
  on public.conversations (user_b_id, last_message_at desc nulls last);

-- ─────────────────────────────────────────────────
-- 2. messages: 채널의 개별 메시지
-- ─────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conv_id uuid not null references public.conversations(id) on delete cascade,
  -- 사용자 삭제되어도 메시지는 보존 ("(탈퇴한 사용자)")
  sender_user_id uuid references auth.users(id) on delete set null,
  -- 옵션 케이스 태그 — 어떤 동물에 대한 메시지인지
  case_id uuid references public.cases(id) on delete set null,
  case_label text,  -- snapshot, 케이스 삭제돼도 텍스트 남음
  content text,
  file_url text,
  file_name text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_has_content check (content is not null or file_url is not null)
);

create index messages_conv_created_idx on public.messages (conv_id, created_at desc);
create index messages_case_idx on public.messages (case_id) where case_id is not null;
create index messages_sender_idx on public.messages (sender_user_id);

-- ─────────────────────────────────────────────────
-- 3. message_reads: 사용자별 채널별 마지막 읽은 시각
-- ─────────────────────────────────────────────────
create table public.message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  conv_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conv_id)
);

-- ─────────────────────────────────────────────────
-- 4. 트리거 — 메시지 발생 시 last_message_at 갱신
-- ─────────────────────────────────────────────────
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = now()
  where id = new.conv_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-- ─────────────────────────────────────────────────
-- 5. RLS — conversations
-- ─────────────────────────────────────────────────
alter table public.conversations enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (
    public.is_super_admin()
    or auth.uid() in (user_a_id, user_b_id)
  );

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert
  with check (auth.uid() in (user_a_id, user_b_id));

-- super_admin 전체 권한 (운영용)
drop policy if exists conversations_super_admin_all on public.conversations;
create policy conversations_super_admin_all on public.conversations
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- 6. RLS — messages
-- ─────────────────────────────────────────────────
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conv_id
        and auth.uid() in (c.user_a_id, c.user_b_id)
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conv_id
        and auth.uid() in (c.user_a_id, c.user_b_id)
    )
  );

-- 본인 메시지 수정 또는 soft delete
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
  for update
  using (sender_user_id = auth.uid())
  with check (sender_user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- 7. RLS — message_reads (본인만)
-- ─────────────────────────────────────────────────
alter table public.message_reads enable row level security;

drop policy if exists message_reads_self on public.message_reads;
create policy message_reads_self on public.message_reads
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────
-- 8. dm_visible 토글
--   organizations.dm_visible — 조직 admin/owner 만 변경 (앱 레벨 제한)
--   profiles.dm_visible — 각 개인 변경
-- ─────────────────────────────────────────────────
alter table public.organizations
  add column if not exists dm_visible boolean not null default true;

alter table public.profiles
  add column if not exists dm_visible boolean not null default true;

-- ─────────────────────────────────────────────────
-- 9. 코멘트
-- ─────────────────────────────────────────────────
comment on table public.conversations is 'Phase A: 1:1 DM. (user_a_id < user_b_id) 정렬, 한 짝당 하나.';
comment on table public.messages is 'Phase A: DM 메시지. case_id/case_label 로 동물 태그 가능.';
comment on table public.message_reads is '사용자별 채널별 마지막 읽은 시각 (안 읽은 카운트용).';
comment on column public.organizations.dm_visible is '외부 사용자 검색에 우리 조직 노출 여부 (조직 admin/owner 만 변경).';
comment on column public.profiles.dm_visible is '본인 검색 노출 여부 (개인 토글, 같은 조직 내부도 적용).';
