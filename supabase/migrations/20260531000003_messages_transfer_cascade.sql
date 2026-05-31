-- 핸드오프 "카드" 메시지(transfer_id 만 있고 content/file_url 없음)가 전송 삭제 시
-- transfer_id → null 이 되면서 group_messages_has_content 체크(content/file_url/transfer_id
-- 중 하나 필수)를 위반 → 전송 삭제가 실패하고, 그게 소스 케이스/조직 삭제까지 줄줄이 막던 버그.
--
-- 수정: messages.transfer_id FK 를 on delete set null → on delete cascade.
--   카드 메시지는 전송의 단순 포인터(내용 없음)라, 전송이 사라지면 함께 삭제하는 것이 옳다.
--   내용 있는 메시지는 transfer_id 를 갖지 않으므로 영향 없음(확인됨: transfer_id 보유 메시지
--   전부 내용 없는 카드).

-- 기존 FK 이름을 동적으로 찾아 제거 (inline 추가라 자동명 messages_transfer_id_fkey 일 것이나 안전하게).
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
  where con.conrelid = 'public.messages'::regclass
    and con.contype = 'f'
    and att.attname = 'transfer_id';
  if cname is not null then
    execute format('alter table public.messages drop constraint %I', cname);
  end if;
end $$;

alter table public.messages
  add constraint messages_transfer_id_fkey
  foreign key (transfer_id) references public.case_transfers(id) on delete cascade;

notify pgrst, 'reload schema';
