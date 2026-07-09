-- 조직 간 대화(사람↔사람 1:1 DM · 그룹 채팅) 완전 삭제.
--
-- WHY: 메시지 기능을 '펫무브워크 시스템 알림' 수신 전용으로 전환한다. 사람끼리
--      주고받던 대화는 더 이상 쓰지 않으므로 데이터까지 정리한다.
--
-- 시스템 알림(kind='system')은 보존 — 새 케이스/신청/공유링크/검증실패 트리거가
-- 모두 kind='system' 대화방에 쌓이므로, kind='normal' 만 지우면 알림은 남는다.
--
-- cascade: conversations 삭제 시 conversation_participants / messages /
--          message_reads 가 on delete cascade 로 함께 삭제된다.
--          conversations.pinned_message_id 자기참조 FK 는 on delete set null 이라
--          삭제 순서와 무관.
--
-- 첨부 파일(storage: chat-files/<convId>/...)의 실제 blob 은 이 SQL 로 지워지지
--          않는다 — 대화방이 사라져 접근 불가한 고아 파일로 남을 뿐 무해하다.
--          필요하면 Storage 에서 별도 정리.

delete from public.conversations where kind <> 'system';
