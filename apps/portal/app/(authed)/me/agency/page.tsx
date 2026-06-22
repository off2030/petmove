import { PartnerEditView } from '@/components/me/partner-edit-view'
import { getPartnerOrgInfo } from '@/lib/actions/partners'

/**
 * 담당 운송업체 상세 — vet 페이지와 동일하게 연락처를 서버에서 미리 읽어 페이지와 함께
 * 내려보낸다(상세 정보가 따로 늦게 뜨는 단계 로딩 제거). 갱신은 PartnerEditView 가 client.
 */
export default async function MeAgencyPage() {
  const r = await getPartnerOrgInfo('transport')
  return <PartnerEditView role="transport" initialOrgInfo={r.ok ? r.value : null} />
}
