-- =============================================================================
-- Phase 11.0.7: 보호자가 케이스(펫) 별로 설정하는 아바타
--
-- TopBar 스위처와 /me Profile pet 카드에 사용. 둘 다 nullable — 미설정 시
-- pet_name 첫 글자 + case.id 해시 색으로 fallback.
--
-- 보호자 update 는 portal server action 의 service role 로 수행 (manual auth
-- 후 cases UPDATE RLS 우회). cases_update RLS 는 그대로 org_member/super_admin
-- 만 통과 — 보호자가 다른 컬럼 건드릴 길은 없음.
-- =============================================================================

alter table public.cases add column if not exists avatar_emoji text;
alter table public.cases add column if not exists avatar_color text;

comment on column public.cases.avatar_emoji is
  '보호자가 선택한 펫 아바타 이모지 (1자). null 이면 pet_name 첫 글자로 fallback.';
comment on column public.cases.avatar_color is
  '보호자가 선택한 펫 아바타 색상 ID (orange/purple/sage/rose/ocean/sand/slate/terracotta). null 이면 case.id 해시로 fallback.';

notify pgrst, 'reload schema';
