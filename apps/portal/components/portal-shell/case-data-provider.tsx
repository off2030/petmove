'use client'

import { supabaseBrowser } from '@petmove/auth'
import type { CaseRow } from '@petmove/domain'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { listMyCases } from '@/lib/actions/cases'
import { getMyProfile, type CustomerProfileRow } from '@/lib/actions/profile'

/**
 * 보호자의 모든 데이터(케이스 + 프로파일)를 한 번 fetch 해 Context 로 공유.
 *
 * 동기화:
 *  1) Realtime — `postgres_changes` on `cases` filter `id=in.(...)`. admin 변경 push 받아 즉시 반영.
 *     (customer_profiles 는 publication 미포함 — focus refetch 로 커버)
 *  2) focus / visibilitychange — 백그라운드 복귀 시 안전망 refresh
 *  3) refresh* / updateCase — 보호자 mutation 후 즉시 갱신
 *
 * 탭/케이스/프로필 전환에서 추가 네트워크 0 — 모든 페이지가 client 로 이 Context 만 읽음.
 */

type CaseDataContextValue = {
  cases: CaseRow[]
  profile: CustomerProfileRow | null
  userEmail: string | null
  refreshCases: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateCase: (next: CaseRow) => void
  updateProfile: (next: CustomerProfileRow) => void
}

const CaseDataContext = createContext<CaseDataContextValue | null>(null)

export function CaseDataProvider({
  initialCases,
  initialProfile,
  userEmail,
  children,
}: {
  initialCases: CaseRow[]
  initialProfile: CustomerProfileRow | null
  userEmail: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>(initialCases)
  const [profile, setProfile] = useState<CustomerProfileRow | null>(initialProfile)

  // 모든 케이스 × 탭 URL 을 백그라운드 prefetch — 케이스 전환 시 RSC 캐시 적중.
  // setTimeout 으로 첫 paint 뒤 시작해 초기 렌더에 영향 없음.
  useEffect(() => {
    if (cases.length === 0) return
    const timer = setTimeout(() => {
      const tabs = ['journey', 'docs', 'info'] as const
      for (const c of cases) {
        for (const t of tabs) {
          try {
            // @ts-expect-error PrefetchKind enum not publicly exported; runtime 'full' matches.
            router.prefetch(`/cases/${c.id}/${t}`, { kind: 'full' })
          } catch {
            /* best-effort */
          }
        }
      }
      try {
        // @ts-expect-error PrefetchKind enum not publicly exported
        router.prefetch('/me', { kind: 'full' })
      } catch {
        /* best-effort */
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [cases, router])

  const refreshCases = useCallback(async () => {
    const result = await listMyCases()
    if (result.ok) setCases(result.value)
  }, [])

  const refreshProfile = useCallback(async () => {
    const result = await getMyProfile()
    if (result.ok) setProfile(result.value)
  }, [])

  const updateCase = useCallback((next: CaseRow) => {
    setCases((prev) => prev.map((c) => (c.id === next.id ? next : c)))
  }, [])

  const updateProfile = useCallback((next: CustomerProfileRow) => {
    setProfile(next)
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
            void refreshCases()
          }
        },
      )
      .subscribe()

    return () => {
      void supabaseBrowser.removeChannel(channel)
    }
  }, [caseIdsKey, refreshCases])

  // 앱 포커스 복귀 시 cases + profile 갱신.
  useEffect(() => {
    const onRefresh = () => {
      void refreshCases()
      void refreshProfile()
    }
    const onVisibility = () => {
      if (!document.hidden) onRefresh()
    }
    window.addEventListener('focus', onRefresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onRefresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshCases, refreshProfile])

  const value = useMemo(
    () => ({
      cases,
      profile,
      userEmail,
      refreshCases,
      refreshProfile,
      updateCase,
      updateProfile,
    }),
    [cases, profile, userEmail, refreshCases, refreshProfile, updateCase, updateProfile],
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

export function useProfile(): {
  profile: CustomerProfileRow | null
  userEmail: string | null
} {
  const { profile, userEmail } = useCases()
  return { profile, userEmail }
}
