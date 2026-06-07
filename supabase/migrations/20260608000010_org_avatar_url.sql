-- 조직 아바타/로고 URL
--
-- 펫무브워크 [설정 > 조직정보] 에서 조직 관리자가 업로드 → 펫무브 [내 정보] 의
-- 담당 동물병원·운송업체 카드(및 변경/선택 화면)에 표시.
--
-- 사진은 기존 user-avatars 버킷을 재사용한다 (보호자 아바타와 동일 관례 — 20260606000001).
-- 경로 규칙: org/{org_id}/{uuid}.jpg
--   - user-avatars insert RLS 는 "첫 폴더 = auth.uid()" 만 허용하므로 보호자/직원이
--     브라우저로 org/ 경로에 직접 쓸 수 없다. 업로드는 admin server action(서비스롤)이
--     담당하며 RLS 를 우회한다(봇 아바타와 동일 패턴). 따라서 별도 스토리지 정책 불필요.
--   - public read 는 기존 user_avatars_select 정책으로 이미 충족 → 펫무브 보호자도 표시 가능.
--
-- portal 가시성: organizations SELECT 는 20260608000003 정책으로 보호자에게
-- hospital/transport/both 조직을 노출한다. avatar_url 은 같은 행의 컬럼이라 추가 정책 없이 읽힌다.

alter table public.organizations
  add column if not exists avatar_url text;

comment on column public.organizations.avatar_url is
  '조직 아바타/로고 public URL (user-avatars 버킷, org/{id}/ 경로). 펫무브 보호자 화면의 담당 병원·운송 카드 표시용. 업로드는 admin server action(서비스롤).';

notify pgrst, 'reload schema';
