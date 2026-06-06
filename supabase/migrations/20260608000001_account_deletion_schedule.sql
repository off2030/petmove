-- =============================================================================
-- 계정 삭제 7일 유예 — customer_profiles.deletion_scheduled_at
-- =============================================================================
-- 보호자가 펫무브 [설정 > 계정 삭제] 에서 탈퇴 요청 시 이 컬럼에 요청 시각을 기록.
-- 유예 종료(요청 +7일) 후 cron 이 hard delete (auth.users DELETE → cascade 로
-- customer_profiles + case_customer_links 동시 삭제) + cases.customer_name,
-- data.email, data.phone 익명화. 신청폼 경로 케이스(cases.source='apply_form')는
-- 담당 조직 운영자에 시스템 봇 알림(notify_new_apply_case 패턴 재사용).
--
-- 유예 중 사용자가 [설정 > 계정 삭제] 에서 취소하면 NULL 로 되돌림.
-- 유예 중 로그인 가능, 단 앱 상단 배너로 "N월 N일 삭제 예정 — 취소" 노출.
--
-- 보유 기간 근거: docs/legal/privacy.md §4 회원 탈퇴 및 정보 삭제.

alter table public.customer_profiles
  add column if not exists deletion_scheduled_at timestamptz;

create index if not exists customer_profiles_deletion_scheduled_idx
  on public.customer_profiles (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

comment on column public.customer_profiles.deletion_scheduled_at is
  '회원 탈퇴 요청 시각. NULL = 활성. 값 있으면 +7일 후 hard delete + 케이스 익명화 (cron).';
