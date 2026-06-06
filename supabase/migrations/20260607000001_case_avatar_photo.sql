-- 펫(케이스) 아바타 사진 URL.
--
-- portal /me/animal 의 PetAvatarPicker 에서 사용. 우선순위: photo_url > color > 기본(이름 이니셜).
-- 보호자 아바타(customer_profiles.avatar_photo_url, 20260606000001)와 동일 패턴이되 케이스별.
-- 사진은 보호자 아바타와 같은 user-avatars 버킷(경로 {user_id}/pets/...) 을 재사용 — 첫 폴더가
-- auth.uid() 라 기존 RLS(20260429000001) 가 그대로 본인 폴더 write 만 허용. 새 버킷 불필요.
-- 아바타는 표시용이라 admin pdf-fill 에 영향 없음.

alter table public.cases
  add column if not exists avatar_photo_url text;

comment on column public.cases.avatar_photo_url is '펫 아바타 사진 public URL (user-avatars 버킷, {user_id}/pets/ 경로). 있으면 색·이니셜보다 우선.';
