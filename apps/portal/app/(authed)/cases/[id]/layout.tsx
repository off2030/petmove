import { notFound } from 'next/navigation'
import { listMyCases } from '@/lib/actions/cases'
import { CaseDataProvider } from '@/components/portal-shell/case-data-provider'
import { CaseSwitcher } from '@/components/portal-shell/case-switcher'

export const dynamic = 'force-dynamic'

/**
 * 케이스 컨텍스트 layout. 4탭 페이지(journey/docs/info)가 이 아래에 들어옴.
 *
 * - listMyCases() 한 번 호출 = 보호자의 모든 케이스 × 모든 컬럼 메모리 적재.
 *   현재 케이스 검증은 그 안에서 find. 별도 getMyCase 불필요.
 * - CaseDataProvider 가 이 데이터를 client Context 로 공유 → 탭/케이스 전환 시 추가 네트워크 0.
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

  const list = await listMyCases()
  if (!list.ok) notFound()
  const cases = list.value
  const current = cases.find((c) => c.id === id)
  if (!current) notFound()

  return (
    <CaseDataProvider initialCases={cases}>
      <CaseSwitcher caseId={id} cases={cases} current={current} />
      {children}
    </CaseDataProvider>
  )
}
