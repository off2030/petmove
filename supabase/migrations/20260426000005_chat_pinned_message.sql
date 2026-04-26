-- 채팅방 공지 — 메시지 하나를 conversation 의 pinned 으로 지정.
-- 양쪽 사용자 모두 등록/해제 가능, 동시 1개만.
-- 메시지 삭제 시 set null (cascade 가 아니라).

alter table public.conversations
  add column if not exists pinned_message_id uuid references public.messages(id) on delete set null;

-- 참여자가 conversations 를 update 할 수 있도록 — pinned_message_id 변경용.
-- user_a_id / user_b_id 는 sorted unique 제약이라 실수로 바꿔도 schema 가 막아줌.
drop policy if exists conversations_update_participant on public.conversations;
create policy conversations_update_participant on public.conversations
  for update
  using (auth.uid() in (user_a_id, user_b_id))
  with check (auth.uid() in (user_a_id, user_b_id));
