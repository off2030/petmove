-- 케이스 핸드오프를 메시지로 발송하기 위한 연결 컬럼.
-- transfer_id 가 set 된 메시지는 UI 에서 "핸드오프 카드"로 렌더링되며
-- 수신자에게 수락/거부 인라인 버튼을 노출.
--
-- 케이스 정보 자체는 case_transfers.payload_snapshot 에 보존되므로
-- 메시지는 단순 포인터 역할 (메시지 삭제해도 전송 기록은 유지).

alter table public.messages
  add column if not exists transfer_id uuid references public.case_transfers(id) on delete set null;

create index if not exists messages_transfer_id_idx
  on public.messages (transfer_id)
  where transfer_id is not null;

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
