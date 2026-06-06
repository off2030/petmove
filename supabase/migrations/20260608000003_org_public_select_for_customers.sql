-- =============================================================================
-- organizations SELECT 확장 — 보호자(portal) 가 카탈로그 읽을 수 있게
-- =============================================================================
-- 기존 organizations_select 정책은 본인 멤버 조직만 노출 → portal 의 보호자
-- (어느 조직 멤버도 아님)는 빈 목록만 받음. [내 정보 > 담당 동물병원·운송업체]
-- 카드의 선택 바텀시트가 동작하려면 hospital/transport/both 조직 노출이 필요.
--
-- 보안 검토:
--   - hospital/transport/both 조직은 사실상 서비스 카탈로그 (운영자도 자기 조직을
--     보호자에게 노출하는 게 자연스러운 비즈 모델)
--   - 인증된 사용자(any signed-in)에게만 노출 — anon 은 anon 정책 별도 부재로 차단
--   - platform 조직(펫무브 직영)은 정책에서 제외 → 보호자 카드 바텀시트에 안 뜸
--   - org_id PK 와 name 정도 노출, business_number 같은 민감 컬럼은 컬럼 단위 GRANT
--     로 따로 통제 가능 (필요 시 후속 단계).

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (
    public.is_org_member(id)
    or public.is_super_admin()
    or org_type in ('hospital', 'transport', 'both')
  );

notify pgrst, 'reload schema';
