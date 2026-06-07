-- 사업자번호 누수 정정.
--
-- super-admin BusinessNumberField 가 조직 전환 시 입력칸 상태(draft)를 리셋하지 않아
-- (컴포넌트 key 누락), 로잔(...001)의 사업자번호 124-18-42859 가 다른 조직(TEST 등)에
-- 잘못 저장될 수 있었다. 코드는 key 추가로 수정. 이미 누수 저장된 값을 정리한다.
--
-- 124-18-42859 는 로잔 전용이므로, 로잔이 아닌 조직에 이 번호가 있으면 누수분 → NULL.
-- (저장된 적 없으면 매칭 0건 → no-op. 안전.)

update public.organizations
set business_number = null
where business_number = '124-18-42859'
  and id <> '00000000-0000-0000-0000-000000000001';
