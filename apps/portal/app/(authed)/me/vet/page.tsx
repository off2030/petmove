import { PartnerEditView } from '@/components/me/partner-edit-view'
import { getPartnerOrgInfo } from '@/lib/actions/partners'

/**
 * 담당 동물병원 상세 — 연락처(주소·전화·네이버·카카오)를 서버에서 미리 읽어 페이지와 함께
 * 내려보낸다(보호자·동물 상세처럼 첫 렌더에 모두 채워짐). 이렇게 안 하면 연락처만 client
 * 에서 따로 fetch 돼 '아바타·버튼 먼저 → 상세 정보 나중' 으로 단계적으로 떴다.
 * 연결 변경 후 갱신은 PartnerEditView 가 client 에서 처리(currentOrgId 변화 시).
 */
export default async function MeVetPage() {
  const r = await getPartnerOrgInfo('vet')
  return <PartnerEditView role="vet" initialOrgInfo={r.ok ? r.value : null} />
}
