-- =============================================================================
-- 펫무브 직영(platform) 조직의 org_type 을 'platform' 으로 복원
-- =============================================================================
-- 직영 조직(…0002)은 20260531000004 에서 org_type='platform' 으로 생성됐는데,
-- 슈퍼어드민 조직설정의 유형 탭(병원/운송/둘다)에 'platform' 선택지가 없어
-- getOrgType 이 platform→'hospital' 로 매핑하고, 저장 시 updateOrgType/setOrgType 이
-- 가드 없이 'both' 등으로 덮어써 드리프트됐다. 그 결과 보호자 [담당 동물병원·운송업체]
-- 카탈로그에 직영이 노출돼 담당 연결이 깨졌다.
--
-- 코드 가드(updateOrgType/setOrgType=직영 거절, 유형 탭 숨김)와 함께, 현재 잘못된
-- 값을 'platform' 으로 되돌린다. vet-info 오버레이는 transport 가 아니면 hospital 처럼
-- 동작하므로 'platform' 복원은 직영 케이스 PDF 발급자 로직에 영향 없음.

update public.organizations
set org_type = 'platform', updated_at = now()
where id = '00000000-0000-0000-0000-000000000002'
  and org_type <> 'platform';

notify pgrst, 'reload schema';
