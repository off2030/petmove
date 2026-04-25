-- profiles.password_set — 이메일 가입자가 비번 설정했는지 표시.
-- magic link 로 가입한 사용자는 처음에 비번이 없음 — UI 가 /set-password 로 강제 유도.
-- OAuth 가입자는 user.app_metadata.providers 로 구분되므로 이 column 으로 강제하지 않음.

alter table public.profiles
  add column if not exists password_set boolean not null default false;

-- 기존 super_admin 본인 (petmove@naver.com) 은 이메일 비번으로 이미 로그인 중 → true seed
update public.profiles
  set password_set = true
  where email = 'petmove@naver.com';
