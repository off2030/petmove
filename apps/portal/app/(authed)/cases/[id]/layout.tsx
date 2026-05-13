import { notFound } from 'next/navigation'
import { getMyCase, listMyCases } from '@/lib/actions/cases'
import { CasePrefetcher } from '@/components/portal-shell/case-prefetcher'
import { CaseSwitcher } from '@/components/portal-shell/case-switcher'

export const dynamic = 'force-dynamic'

/**
 * 케이스 컨텍스트 layout. 4탭 페이지(journey/docs/info)가 이 아래에 들어옴.
 *
 * - params.id 검증 — 본인 case_customer_links 에 매핑된 케이스가 아니면 404.
 *   listMyCases / getMyCase 모두 inner join 으로 본인 link 만 통과.
 * - 케이스 스위처(가족 여러 마리)를 상단 고정. 케이스 1건이면 자동 숨김.
 */
export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [single, list] = await Promise.all([getMyCase(id), listMyCases()])
  if (!single.ok || !single.value) notFound()
  const cases = list.ok ? list.value : []
  const current = single.value

  return (
    <>
      <CaseSwitcher caseId={id} cases={cases} current={current} />
      <CasePrefetcher caseIds={cases.map((c) => c.id)} currentCaseId={id} />
      {children}
    </>
  )
}
