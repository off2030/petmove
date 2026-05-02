-- messages 에 sender_name 비정규화 — 채팅 fetch 시 profiles JOIN 제거.
--
-- WHY: listConversationMessages 가 senderIds 별 profiles 를 별도 RTT 로
--      조회. 활성 대화일수록 senderIds 가 많아 latency 증가. send 시점에
--      현 sender 이름을 row 에 박아두면 read 경로에서 JOIN 불필요.
-- 이름이 바뀐 사용자의 과거 메시지는 옛 이름으로 표시되지만, 카카오톡 등
-- 메신저 표준 동작과 동일.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_name text;

-- 기존 행 백필 — profiles.name 우선, 없으면 email.
UPDATE messages m
SET sender_name = COALESCE(p.name, p.email)
FROM profiles p
WHERE m.sender_user_id = p.id
  AND m.sender_name IS NULL;
