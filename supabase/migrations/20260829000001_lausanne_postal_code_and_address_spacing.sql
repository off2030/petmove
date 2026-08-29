-- 로잔 조직정보(company_info) 주소 정리 — 명판인 제작에 맞춰 증명서 출력값과 도장을 일치시킨다.
--
--   1) postal_code 추가 (08727). 조직정보 우편번호 칸이 비어 있었다.
--   2) address_ko 도로명 띄어쓰기 표준화: '관악로 29길' → '관악로29길'.
--      도로명주소 표기 규칙상 도로명과 길 번호는 붙여 쓴다.
--   3) 영문 주소에 우편번호 반영. address_en(전체) 과 address_locality_en(별지25 hospital_address2)
--      둘 다 'Seoul,' → 'Seoul 08727,'. 두 값은 서로 다른 PDF 필드로 나가므로 같이 고쳐야 어긋나지 않는다.
--
-- 멱등: jsonb_strip_nulls 로 "이미 정리된 키"는 patch 에서 빠지므로 재실행해도 값이 그대로다.
-- 값이 NULL 인 키도 replace() 가 NULL 을 내고 → strip 되어, 없던 키를 JSON null 로 만들지 않는다.

update public.organization_settings
   set value = value || jsonb_strip_nulls(jsonb_build_object(
         'postal_code',
           case when value->>'postal_code' = '08727' then null else '08727' end,

         'address_ko',
           case when value->>'address_ko' like '%관악로29길%' then null
                else replace(value->>'address_ko', '관악로 29길', '관악로29길') end,

         'address_en',
           case when value->>'address_en' like '%08727%' then null
                else replace(value->>'address_en', 'Seoul,', 'Seoul 08727,') end,

         'address_locality_en',
           case when value->>'address_locality_en' like '%08727%' then null
                else replace(value->>'address_locality_en', 'Seoul,', 'Seoul 08727,') end
       )),
       updated_at = now()
 where org_id = '00000000-0000-0000-0000-000000000001'
   and key = 'company_info';

-- 검증 — 아래 4개 값을 눈으로 확인한다.
--   postal_code          08727
--   address_ko           대한민국 서울시 관악구 관악로29길 3, 수안빌딩 1층
--   address_en           1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul 08727, Republic of Korea
--   address_locality_en  Gwanak-gu, Seoul 08727, Republic of Korea
select value->>'postal_code'         as postal_code,
       value->>'address_ko'          as address_ko,
       value->>'address_en'          as address_en,
       value->>'address_street_en'   as address_street_en,
       value->>'address_locality_en' as address_locality_en
  from public.organization_settings
 where org_id = '00000000-0000-0000-0000-000000000001'
   and key = 'company_info';
