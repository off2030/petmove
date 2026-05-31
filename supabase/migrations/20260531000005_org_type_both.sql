-- 조직 유형에 'both'(동물병원 + 운송회사) 추가 — 둘 다 하는 조직 대응.
-- 'both' 는 자체 수의사가 있는 병원이면서 운송도 하는 곳 → PDF 발급자는 자기 수의사
-- (앱 로직에서 transport 가 아니면 hospital 처럼 동작). 회사 정보는 병원+운송 양쪽 보유.

alter table public.organizations drop constraint if exists organizations_org_type_check;
alter table public.organizations
  add constraint organizations_org_type_check
  check (org_type in ('hospital','transport','platform','both'));

notify pgrst, 'reload schema';
