'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 케이스 × 탭 전 조합을 백그라운드 prefetch — 첫 페이지가 그려진 뒤 500ms 후 시작.
 *
 * staleTimes.dynamic = 30s 과 짝. kind: 'full' 로 dynamic 페이지의 RSC payload
 * 까지 통째로 가져와 클라이언트 라우터 캐시에 적재 → 30초간 모든 케이스·탭 전환 즉시.
 *
 * 초기 로딩에 영향이 없도록:
 *  - setTimeout 500ms 로 첫 paint 뒤 시작
 *  - 브라우저 네트워크 큐의 후순위 (RSC 요청이라 자연스럽게 메인 페이지 뒤에 들어감)
 *  - 보호자당 보통 1~3 케이스 × 3 탭 + /me = 4~10 요청, 병렬 처리로 수백ms 안에 완료
 *
 * 이 컴포넌트는 CaseLayout 안에 마운트 — caseIds 는 이미 부모가 listMyCases 로 가져온 것이라
 * 추가 server fetch 없이 prop 으로 받는다.
 *
 * currentTab 은 layout 에서 알 수 없으므로(server layout 은 pathname 모름) client 에서
 * usePathname 으로 판단.
 */

const TABS = ['journey', 'docs', 'info'] as const
type CaseTab = (typeof TABS)[number]

function tabFromPath(pathname: string): CaseTab {
  if (pathname.includes('/docs')) return 'docs'
  if (pathname.includes('/info')) return 'info'
  return 'journey'
}

type Props = {
  caseIds: string[]
  currentCaseId: string
}

export function CasePrefetcher({ caseIds, currentCaseId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const currentTab = tabFromPath(pathname)

  useEffect(() => {
    const timer = setTimeout(() => {
      const urls = new Set<string>()

      // 다른 케이스의 현재 탭 — "케이스 전환" 을 즉시화
      for (const id of caseIds) {
        if (id === currentCaseId) continue
        urls.add(`/cases/${id}/${currentTab}`)
      }

      // 현재 케이스의 다른 탭 — SwipeTabs 가 인접 탭만 처리, 여기서 나머지 보강
      for (const t of TABS) {
        if (t === currentTab) continue
        urls.add(`/cases/${currentCaseId}/${t}`)
      }

      // /me 도 4탭의 하나 — 마지막 탭으로 자주 진입
      urls.add('/me')

      for (const url of urls) {
        try {
          // @ts-expect-error PrefetchKind enum not publicly exported; runtime string 'full' matches.
          router.prefetch(url, { kind: 'full' })
        } catch {
          /* best-effort */
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [caseIds, currentCaseId, currentTab, router])

  return null
}
