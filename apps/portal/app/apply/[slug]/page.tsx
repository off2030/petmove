import { redirect } from 'next/navigation'
import { createAdminClient } from '@petmove/auth'
import { ApplyForm } from '../apply-form'

export const dynamic = 'force-dynamic'

/**
 * /apply/<slug> — 조직별 신청 링크. slug 로 조직을 찾아 그 org 로 귀속.
 * slug 를 못 찾으면 직영(/apply)으로 보냄. (slug 는 소문자 저장 — 대소문자 무시 매칭)
 *
 * 조직 조회는 service-role — organizations RLS(org 멤버/super_admin)는 외부 신청자에게
 * 안 열려 있으므로. (공개 신청 링크 → org 해석만, 읽기 전용.)
 */
export default async function OrgApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('slug', slug.toLowerCase())
    .maybeSingle()
  if (!org) redirect('/apply')
  // 조직별 공개 신청 — 병원 손님이 로그인 없이 작성(이메일 직접 입력·익명 제출).
  return <ApplyForm orgId={org.id as string} orgName={(org.name as string) ?? '펫무브'} isPublic />
}
