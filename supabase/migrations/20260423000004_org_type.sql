-- 조직 유형 — 동물병원(hospital) 또는 운송회사(transport).
-- 운송회사는 자체 수의사가 없고 제휴 병원 정보를 입력해 PDF 에 사용.

alter table public.organizations
  add column if not exists org_type text not null default 'hospital';

alter table public.organizations
  drop constraint if exists organizations_org_type_check;

alter table public.organizations
  add constraint organizations_org_type_check
  check (org_type in ('hospital','transport'));
