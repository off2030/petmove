import { ApplyForm } from './apply-form'

// 조직 표시 없는 /apply = 펫무브 직영(platform). 어느 병원/운송 업체에도 안 속하는
// 고객 직접 신청 → 직영 org 로 귀속, super_admin 만 관리. (조직별 신청은 /apply/<slug>)
const DIRECT_ORG_ID = '00000000-0000-0000-0000-000000000002'

export default function ApplyPage() {
  // 직영(펫무브 플랫폼) 자체 신청 — 로그인 후 진입(계정 이메일 사용). isPublic=false.
  return <ApplyForm orgId={DIRECT_ORG_ID} orgName="펫무브" isPublic={false} />
}
