-- profiles 에 개인 담당자 정보 jsonb column 추가.
-- 사용 목적: 동물병원의 수의사 본인, 운송회사의 담당자 본인 정보를 user-level 로 분리 저장.
-- 한 조직에 여러 멤버가 있을 때 cert PDF 의 vet:* transform 이 발급자 본인의 정보로
-- 채워지도록 — org-level (organization_settings.company_info) 은 회사·병원 공유 정보(주소·우편번호·
-- 회사명·이메일 등) 만 유지하고, 발급자 본인 식별 정보(이름·휴대폰·면허번호) 는 여기서.
--
-- 스키마는 의도적으로 jsonb (org_settings 와 동일 패턴) — 추가 필드 늘릴 때 마이그레이션 불필요.
-- 키:
--   name_ko             — 한글 이름 ("이진원")
--   name_first_en       — 영문 이름 (First, "Jinwon")
--   name_last_en        — 영문 성 (Last, "Lee")
--   name_en             — 합성 ("Jinwon Lee") — name_first_en + name_last_en 자동 sync
--   mobile_phone        — 휴대폰 ("010-1234-5678")
--   license_no          — 수의사 면허번호 (hospital org 에서만 의미, transport 는 비워둠)

alter table public.profiles
  add column if not exists contact_info jsonb not null default '{}'::jsonb;

-- RLS 는 기존 profiles_self_select / profiles_self_update 정책으로 본인 row 만 read/write 가능.
-- 추가 정책 불필요.

notify pgrst, 'reload schema';
