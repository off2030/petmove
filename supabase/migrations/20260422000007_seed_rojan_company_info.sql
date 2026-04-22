-- 로잔 organization_settings.company_info 완전 seed.
-- DEFAULT_VET_INFO 하드코딩을 제거할 수 있도록, 로잔 데이터를 DB 에 영구 저장.
-- 기존 유저 저장값이 있으면 그 값 우선(|| 연산자는 우측이 덮어씀 — EXCLUDED.value 가 base, existing 이 덮어씀).

insert into public.organization_settings (org_id, key, value)
values (
  '00000000-0000-0000-0000-000000000001',
  'company_info',
  jsonb_build_object(
    'name_ko', '이진원',
    'clinic_ko', '로잔동물의료센터',
    'address_ko', '대한민국 서울시 관악구 관악로 29길 3, 수안빌딩 1층',
    'name_en', 'Jinwon Lee',
    'clinic_en', 'Lausanne Veterinary Medical Center',
    'address_en', '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    'address_street_en', '1st floor, 3, Gwanak-ro 29-gil',
    'address_locality_en', 'Gwanak-gu, Seoul, Republic of Korea',
    'phone', '02-872-7588',
    'phone_intl', '+82-2-872-7588',
    'email', 'petmove@naver.com',
    'license_no', '9608'
  )
)
on conflict (org_id, key) do update
  set value = excluded.value || organization_settings.value,
      updated_at = now();

-- 검증
select org_id, key, jsonb_object_keys(value) as keys
  from public.organization_settings
 where key = 'company_info';
