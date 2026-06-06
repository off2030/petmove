-- 보호자 아바타 — 이모지·배경색·사진 URL.
--
-- portal /me/guardian 의 GuardianAvatarPicker 에서 사용. 우선순위: photo_url > emoji+color > 기본(이니셜).
-- emoji / color 의 화이트리스트 검증은 portal updateMyProfile 서버액션이 담당 (admin pdf-fill 영향 X — 아바타는
-- 표시용이지 서류에 들어가지 않음).

alter table public.customer_profiles
  add column if not exists avatar_emoji text,
  add column if not exists avatar_color text,
  add column if not exists avatar_photo_url text;

comment on column public.customer_profiles.avatar_emoji is '보호자 아바타 이모지 (단일). null 이면 이니셜 fallback.';
comment on column public.customer_profiles.avatar_color is '보호자 아바타 배경색 ID (orange|purple|sage|rose|ocean|sand|slate|terracotta).';
comment on column public.customer_profiles.avatar_photo_url is '보호자 아바타 사진 public URL (user-avatars bucket). 있으면 이모지·색보다 우선.';
