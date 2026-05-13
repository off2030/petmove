'use client'

import { supabaseBrowser } from '@petmove/auth'
import type { CaseRow } from '@petmove/domain'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { listMyCases } from '@/lib/actions/cases'

/**
 * 보호자의 모든 케이스 데이터를 한 번 fetch 해 Context 로 공유.
 *
 * 동기화 메커니즘:
 *  1) Realtime (`postgres_changes` on `cases` filter `id=in.(...)`) — admin 측 변경 push 받아 즉시 반영
 *  2) focus / visibilitychange — 백그라운드 복귀 시 안전망 refresh (Realtime 끊겼거나 휴면 중 변경 커버)
 *  3) refresh() / updateCase() — 보호자 mutation 후 즉시 갱신
 *
 * 탭/케이스 전환에서 추가 네트워크 0 — 모든 탭 페이지가 client 로 이 Context 만 읽음.
 *
 * SSR: CaseLayout 이 server 측 listMyCases 결과를 initialCases 로 주입 → 첫 paint 부터 데이터 있음.
 */

type CaseDataContextValue = {
  cases: CaseRow[]
  refresh: () => Promise<void>
  updateCase: (next: CaseRow) => void
}

const CaseDataContext = createContext<CaseDataContextValue | null>(null)

export function CaseDataProvider({
  initialCases,
  children,
}: {
  initialCases: CaseRow[]
  children: React.ReactNode
}) {
  const [cases, setCases] = useState<CaseRow[]>(initialCases)

  const refresh = useCallback(async () => {
    const result = await listMyCases()
    if (result.ok) setCases(result.value)
  }, [])

  const updateCase = useCallback((next: CaseRow) => {
    setCases((prev) => prev.map((c) => (c.id === next.id ? next : c)))
  }, [])

  // 케이스 id 집합이 바뀌면 Realtime 재구독.
  const caseIdsKey = useMemo(
    () => cases.map((c) => c.id).sort().join(','),
    [cases],
  )

  useEffect(() => {
    if (!caseIdsKey) return
    const ids = caseIdsKey.split(',')

    const channel = supabaseBrowser
      .channel(`portal-cases-${ids[0]?.slice(0, 8) ?? 'empty'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cases',
          filter: `id=in.(${ids.join(',')})`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setCases((prev) =>
              prev.map((c) =>
                c.id === (payload.new as CaseRow).id ? (payload.new as CaseRow) : c,
              ),
            )
          } else {
            // INSERT/DELETE: 케이스 목록 자체 변동 — case_customer_links 까지 확인하려면 listMyCases.
            void refresh()
          }
        },
      )
      .subscribe()

    return () => {
      void supabaseBrowser.removeChannel(channel)
    }
  }, [caseIdsKey, refresh])

  // 앱 포커스 복귀 시 refresh — Realtime 끊겼거나 휴면 동안 변경 커버.
  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    const onVisibility = () => {
      if (!document.hidden) void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  const value = useMemo(
    () => ({ cases, refresh, updateCase }),
    [cases, refresh, updateCase],
  )

  return <CaseDataContext.Provider value={value}>{children}</CaseDataContext.Provider>
}

export function useCases(): CaseDataContextValue {
  const ctx = useContext(CaseDataContext)
  if (!ctx) throw new Error('useCases must be used within CaseDataProvider')
  return ctx
}

export function useCase(caseId: string): CaseRow | null {
  const { cases } = useCases()
  return cases.find((c) => c.id === caseId) ?? null
}
