-- 보호자 연락처를 customer_profiles 단일 소유로 승격.
--
-- 배경: 보호자 연락처(이름·전화·이메일·주소)는 그동안 동물(케이스)마다 cases.data /
-- cases 컬럼에 복제 저장됐고, /me/guardian 편집은 primary 케이스 하나만 갱신했다. 동물이
-- 여러 마리면 한 동물만 바뀌고 나머지는 옛 값으로 남는 누락(=리포트된 버그). 이제 profile 을
-- 권위 소유자로 두고, 편집 시 profile + 연결된 모든 케이스로 전파한다(materialize). admin·PDF 는
-- 여전히 per-case 로 읽으므로 케이스 복제본은 유지 — 포털↔admin 경계는 안 건드린다.
--
-- 이름(한글)은 기존 display_name 을 재사용(카탈로그가 이미 customer_name 폴백으로 사용 중),
-- 전화는 phone 재사용, 이메일은 로그인 이메일(email_normalized)과 구분되는 연락용 contact_email 신설.

alter table customer_profiles
  add column if not exists name_first_en    text,
  add column if not exists name_last_en     text,
  add column if not exists contact_email    text,
  add column if not exists address_kr       text,  -- 도로명+상세 합본 (cases.data.address_kr 와 동일 형식)
  add column if not exists address_detail_kr text,
  add column if not exists address_zipcode  text,
  add column if not exists address_en       text;  -- 국내 주소 영문 (해외 거주지 address_overseas 와 무관)

-- 백필: 각 사용자의 가장 최근 갱신된 연결 케이스에서 보호자 연락처를 끌어온다.
-- 이미 값이 있으면 보존(coalesce). address_en 은 data->>'address_en' 만 사용 —
-- destination-scoped 인 address_overseas 가 국내 주소칸으로 새지 않게.
update customer_profiles p set
  display_name      = coalesce(p.display_name, c.customer_name),
  name_first_en     = coalesce(p.name_first_en, c.data->>'customer_first_name_en'),
  name_last_en      = coalesce(p.name_last_en, c.data->>'customer_last_name_en'),
  phone             = coalesce(p.phone, c.data->>'phone'),
  contact_email     = coalesce(p.contact_email, c.data->>'email'),
  address_kr        = coalesce(p.address_kr, c.data->>'address_kr', c.data->>'address_ko'),
  address_detail_kr = coalesce(p.address_detail_kr, c.data->>'address_detail_kr'),
  address_zipcode   = coalesce(p.address_zipcode, c.data->>'address_zipcode', c.data->>'postal_code', c.data->>'zipcode'),
  address_en        = coalesce(p.address_en, c.data->>'address_en')
from (
  select distinct on (l.user_id)
    l.user_id,
    cs.customer_name,
    cs.data
  from case_customer_links l
  join cases cs on cs.id = l.case_id and cs.deleted_at is null
  order by l.user_id, cs.updated_at desc
) c
where p.user_id = c.user_id;
