-- 채팅 폴링 제거 — supabase_realtime publication 에 messages / conversations 추가.
-- INSERT (새 메시지), UPDATE (deleted_at soft-delete + last_message_at trigger),
-- DELETE (대화방 삭제) 이벤트를 클라이언트가 수신.
-- RLS 가 그대로 적용되므로 본인 채널이 아니면 이벤트 도달 안 함.

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception
  when duplicate_object then null;
end $$;
