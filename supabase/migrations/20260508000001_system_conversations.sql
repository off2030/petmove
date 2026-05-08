-- 시스템 대화방 — 펫무브워크 자동 알림 (검증 실패 등). 유저 1인 + 자동 발신 메시지 (sender_user_id=null) 만 가짐.
--
-- WHY: 증명서 발급 시 검증 실패가 있으면 펫무브워크 이름으로 메시지를 남겨
--      사용자가 사후에도 확인하고 클릭으로 케이스 상세로 이동할 수 있게 한다.
-- 일반 1:1/그룹 대화와 같은 messages/conversations 테이블을 공유 — 메시지함에서 함께 노출.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'normal';

DO $$ BEGIN
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('normal', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS conversations_system_owner_idx
  ON public.conversations (created_by)
  WHERE kind = 'system';

COMMENT ON COLUMN public.conversations.kind IS
  'normal=일반 1:1/그룹, system=펫무브워크 자동 알림 (sender_user_id=null + sender_name 사용).';
