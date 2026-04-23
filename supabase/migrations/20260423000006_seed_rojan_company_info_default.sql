-- organization_settings 에 key='company_info_default' 추가.
-- 이 값은 "기본값으로 되돌리기" 가 복원 대상으로 사용. 사용자가 company_info 를
-- 지우거나 잘못 수정해도 이 snapshot 으로 복구 가능.
-- seed 값 자체는 바뀌지 않고 고정. 나중에 업데이트하려면 별도 migration.

insert into public.organization_settings (org_id, key, value)
values (
  '00000000-0000-0000-0000-000000000001',
  'company_info_default',
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
    'license_no', '9608',
    'transport_company_ko', '',
    'transport_company_en', '',
    'transport_contact_ko', '',
    'transport_contact_en', ''
  )
)
on conflict (org_id, key) do nothing;
