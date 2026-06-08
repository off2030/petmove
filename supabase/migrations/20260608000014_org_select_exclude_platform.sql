-- =============================================================================
-- organizations SELECT — 플랫폼(펫무브 직영) 을 보호자 카탈로그에서 명시 제외
-- =============================================================================
-- 20260608000003 은 org_type in ('hospital','transport','both') 를 누구나 읽게 열어
-- 보호자 [담당 동물병원·운송업체] 선택 시트를 채운다. 그런데 플랫폼 조직(…0002)의
-- org_type 이 'platform' 에서 'both' 로 드리프트되면 카탈로그에 새어 들어와,
-- 보호자가 직영을 담당으로 고를 수 있게 된다. 직영을 고르면 org_id/transport_org_id 가
-- platform 으로 설정되는데, org_id=platform 은 "담당 미정"=연결 해제 의미라 기존 담당
-- 병원 연결이 사라지는 결함이 된다.
--
-- → org_type 값에 의존하지 말고 플랫폼 고정 UUID 로 카탈로그에서 제외한다(방어선).
--    앱 코드(listAvailableOrgs/setPartnerOrg)도 같은 id 로 막지만, RLS 에서도 막아
--    어떤 쿼리로도 직영이 보호자에게 파트너로 노출되지 않게 한다.

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (
    public.is_org_member(id)
    or public.is_super_admin()
    or (
      org_type in ('hospital', 'transport', 'both')
      and id <> '00000000-0000-0000-0000-000000000002'
    )
  );

-- 정리: 직영을 운송업체로 잘못 연결해 저장된 케이스를 해제(null)한다. 직영은 파트너가
-- 아니다. (org_id=platform 은 "담당 미정"의 정상값이라 건드리지 않는다.)
update public.cases
set transport_org_id = null
where transport_org_id = '00000000-0000-0000-0000-000000000002';

notify pgrst, 'reload schema';
