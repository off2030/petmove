-- 조직에 사업자번호 컬럼 추가.
-- super-admin 조직 명부에서 UUID 대신 사업자번호로 식별.
-- 형식: 'XXX-XX-XXXXX' (10자리, 하이픈 포함) — 검증은 애플리케이션 레이어에서.

alter table public.organizations
  add column if not exists business_number text;

-- 로잔 seed
update public.organizations
   set business_number = '124-18-42859'
 where id = '00000000-0000-0000-0000-000000000001'
   and business_number is null;
