-- 케이스 핸드오프 메시지는 노트(content)·파일(file_url) 없이 transfer_id 만으로도 유효해야 한다.
-- 기존 group_messages_has_content 체크는 content/file_url 둘 중 하나 필수였음 → transfer_id 도 허용.
--
-- (테이블이 unify_chat 후 messages 로 rename 됐지만 constraint 이름은 group_messages_has_content 로 보존.)

alter table public.messages
  drop constraint if exists group_messages_has_content;

alter table public.messages
  add constraint group_messages_has_content
  check (content is not null or file_url is not null or transfer_id is not null);

notify pgrst, 'reload schema';
