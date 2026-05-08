-- 케이스별 펫무브워크 알림 발송 이력 — 동일 검증 실패에 중복 발송 방지.
--
-- 의미: 마지막으로 알림을 보낸 시점에 실패 상태였던 check.id 들의 집합.
-- 매 updateCaseField 후 현재 실패 집합과 비교해 새로 추가된 항목만 알림 발송.
-- 검증이 통과하면 집합에서 빠지므로, 다시 깨지면 재발송된다.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS notified_check_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.cases.notified_check_ids IS
  '직전 펫무브워크 검증 실패 알림 시점의 실패 check.id 집합. 신규 실패만 발송하기 위한 dedup.';
