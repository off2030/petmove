'use client'

import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CaseRow } from '@petmove/domain'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { listMyCases } from '@/lib/actions/cases'
import { getMyProfile, type CustomerProfileRow } from '@/lib/actions/profile'
import { getPartnerOrgsByIds, type PartnerOrg } from '@/lib/actions/partners'
import { LAST_CASE_KEY } from './last-case'

type PartnerOrgs = { vet: PartnerOrg | null; transport: PartnerOrg | null }

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
  /** 담당 병원·운송 조직 — 첫 케이스의 org_id/transport_org_id 기준, 서버 초기 로드로 채움. */
  partners: PartnerOrgs
  /** 선택 가능한 운송 조직이 하나라도 있는지 — false 면 '담당 운송업체' 메뉴를 숨긴다. */
  transportAvailable: boolean
  refreshCases: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateCase: (next: CaseRow) => void
  updateProfile: (next: CustomerProfileRow) => void
  /** 케이스 삭제 후 즉시 client 갱신 — refreshCases 백그라운드 동안 잔상 방지 + lastCaseId 정리. */
  removeCase: (id: string) => void
}

const CaseDataContext = createContext<CaseDataContextValue | null>(null)

export function CaseDataProvider({
  initialCases,
  initialProfile,
  initialPartners,
  initialTransportAvailable = false,
  userEmail,
  previewMode = false,
  children,
}: {
  initialCases: CaseRow[]
  initialProfile: CustomerProfileRow | null
  initialPartners: PartnerOrgs
  /** 선택 가능한 운송 조직 존재 여부 — 서버에서 한 번 계산해 내려준다(세션 중 정적). */
  initialTransportAvailable?: boolean
  userEmail: string | null
  /** 펫무브워크 고객앱 미리보기 — 보호자 세션이 없어 Realtime·refetch 를 끈다. */
  previewMode?: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>(initialCases)
  const [profile, setProfile] = useState<CustomerProfileRow | null>(initialProfile)
  const [partners, setPartners] = useState<PartnerOrgs>(initialPartners)

  // 모든 케이스 × 탭 URL 을 백그라운드 prefetch — 케이스 전환 시 RSC 캐시 적중.
  //
  // dep 을 cases 가 아니라 caseIdsKey (정렬된 ID 문자열) 로 — focus refresh / Realtime
  // UPDATE 가 새 array reference 를 만들어도 ID 집합이 같으면 useEffect 재실행 X.
  // (이전 [cases, router] dep 은 매 cases 갱신마다 모든 URL prefetch 가 재발사돼
  // 네트워크 큐를 압박, 진짜 click 한 URL 의 RSC 가 그 뒤에 줄 서서 case 전환 lag 유발했음.)
  //
  // prefetchedRef 로 이미 prefetch 한 URL 추적 — 케이스가 추가되어도 새 URL 만 보충.
  const prefetchedRef = useRef<Set<string>>(new Set())
  const caseIdsKey = useMemo(
    () => cases.map((c) => c.id).sort().join(','),
    [cases],
  )

  useEffect(() => {
    if (!caseIdsKey) return
    const ids = caseIdsKey.split(',')
    const urls: string[] = []
    const tabs = ['journey', 'docs', 'info'] as const
    for (const id of ids) {
      for (const t of tabs) {
        const url = `/cases/${id}/${t}`
        if (!prefetchedRef.current.has(url)) urls.push(url)
      }
    }
    if (!prefetchedRef.current.has('/me')) urls.push('/me')
    if (urls.length === 0) return

    // 첫 paint 와 경쟁하지 않도록 — window 'load' 이벤트 (모든 리소스 완료) + 1500ms 뒤 실행.
    // 또는 사용자의 첫 입력 (touch/scroll) — 어느 쪽이든 먼저 발생한 것을 트리거로.
    // (이전 requestIdleCallback 은 idle 이 너무 빨리 와서 첫 paint 직후 경쟁 발생했음.)
    let cancelled = false
    let timer: number | undefined

    const start = () => {
      if (cancelled) return
      cancelled = true
      timer = window.setTimeout(() => {
        for (const url of urls) {
          try {
            // @ts-expect-error PrefetchKind enum not publicly exported; runtime 'full' matches.
            router.prefetch(url, { kind: 'full' })
            prefetchedRef.current.add(url)
          } catch {
            /* best-effort */
          }
        }
      }, 1500)
    }

    const onInteract = () => start()

    if (document.readyState === 'complete') {
      // 이미 load 끝났으면 1500ms 만 추가 대기
      start()
    } else {
      window.addEventListener('load', start, { once: true })
    }
    window.addEventListener('touchstart', onInteract, { once: true, passive: true })
    window.addEventListener('scroll', onInteract, { once: true, passive: true })

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('load', start)
      window.removeEventListener('touchstart', onInteract)
      window.removeEventListener('scroll', onInteract)
    }
  }, [caseIdsKey, router])

  // 담당 병원·운송 카드 데이터. 초기값은 서버(layout)가 첫 케이스 org_id 로 채워 넘긴다 —
  // 그래서 첫 마운트엔 재fetch 하지 않는다(빈칸 깜빡임 방지). 보호자가 /me/vet·/me/agency
  // 에서 병원을 바꾸면 refreshCases 로 cases[0].org_id 가 갱신 → partnerKey 변함 → 그때만
  // organizations 를 다시 읽어 카드 이름을 최신화. (org 가 안 변한 일반 refresh 엔 재fetch 안 함.)
  const partnerKey = useMemo(() => {
    const first = cases[0]
    return first ? `${first.org_id ?? ''}|${first.transport_org_id ?? ''}` : ''
  }, [cases])
  const partnersFirstRun = useRef(true)
  useEffect(() => {
    if (previewMode) return
    if (partnersFirstRun.current) {
      partnersFirstRun.current = false
      return // initialPartners 가 이미 이 key 를 커버
    }
    let cancelled = false
    const first = cases[0] ?? null
    void getPartnerOrgsByIds(first?.org_id ?? null, first?.transport_org_id ?? null).then((r) => {
      if (cancelled) return
      if (r.ok) setPartners(r.value)
    })
    return () => {
      cancelled = true
    }
    // cases 가 아니라 partnerKey 가 트리거 — org 가 실제로 바뀔 때만 재fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerKey, previewMode])

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

  const removeCase = useCallback((id: string) => {
    setCases((prev) => prev.filter((c) => c.id !== id))
    // lastCaseId 가 삭제된 케이스를 가리키고 있으면 비움 — bottom-nav / swipe-tabs 가
    // 다음 케이스로 폴백. 안 비우면 /cases/{삭제된id}/docs 등으로 가서 404.
    try {
      if (window.sessionStorage.getItem(LAST_CASE_KEY) === id) {
        window.sessionStorage.removeItem(LAST_CASE_KEY)
      }
    } catch {
      /* sessionStorage 접근 실패 — 무시 */
    }
  }, [])

  // Realtime — 첫 paint 안정 후로 지연. WebSocket 핸드셰이크 + supabase realtime 모듈 파싱이
  // 초기 진입 마지막 구간 lag 의 한 축. caseIdsKey 가 변하면 (= 케이스 추가/삭제) 재구독.
  useEffect(() => {
    // 미리보기: 보호자 세션이 없어 Realtime 구독이 무의미 — 생략.
    if (previewMode) return
    if (!caseIdsKey) return
    const ids = caseIdsKey.split(',')
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null
    let cancelled = false

    const subscribe = () => {
      if (cancelled) return
      channel = supabaseBrowser
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
              const next = payload.new as CaseRow & { deleted_at?: string | null }
              if (next.deleted_at) {
                // 소프트삭제 — 운영자가 펫무브워크에서 삭제(deleted_at 설정)하면 UPDATE 로
                // 들어온다. 목록에서 즉시 제거 (안 그러면 deleted 케이스가 앱에 계속 보임).
                setCases((prev) => prev.filter((c) => c.id !== next.id))
              } else {
                // Realtime 은 행이 max_record_bytes(기본 1MB) 를 넘으면 payload 를 잘라
                // 보낸다 — 작은 컬럼은 남고 큰 data(jsonb) 가 비거나 누락된다. 이 잘린
                // payload 로 캐시를 덮으면 보호자 화면에서 내 정보가 통째로 사라진다
                // (DB 는 멀쩡). 고객 케이스는 항상 data 가 있으므로, errors 가 있거나
                // data 가 비어 들어오면 잘린 것으로 보고 권위 데이터를 재fetch 한다.
                const errs = (payload as { errors?: unknown[] }).errors
                const truncated =
                  (Array.isArray(errs) && errs.length > 0) ||
                  next.data == null ||
                  (typeof next.data === 'object' && Object.keys(next.data as object).length === 0)
                if (truncated) {
                  void refreshCases()
                } else {
                  setCases((prev) => prev.map((c) => (c.id === next.id ? (next as CaseRow) : c)))
                }
              }
            } else {
              // INSERT/DELETE: case_customer_links 까지 확인하려면 listMyCases 재조회.
              void refreshCases()
            }
          },
        )
        .subscribe()
    }

    // load 이벤트 + 2초 지연 — 초기 진입 안정화 우선. 사용자 입력이 먼저 와도 트리거.
    let timer: number | undefined
    const start = () => {
      if (cancelled || channel) return
      timer = window.setTimeout(subscribe, 2000)
    }
    const onInteract = () => {
      if (cancelled || channel) return
      if (timer !== undefined) clearTimeout(timer)
      subscribe()
    }

    if (document.readyState === 'complete') {
      start()
    } else {
      window.addEventListener('load', start, { once: true })
    }
    window.addEventListener('touchstart', onInteract, { once: true, passive: true })

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('load', start)
      window.removeEventListener('touchstart', onInteract)
      if (channel) void supabaseBrowser.removeChannel(channel)
    }
  }, [caseIdsKey, refreshCases, previewMode])

  // 앱 포커스 복귀 시 cases + profile 갱신.
  useEffect(() => {
    // 미리보기: 세션이 없어 refetch 가 무의미 — 생략.
    if (previewMode) return
    const onRefresh = () => {
      void refreshCases()
      void refreshProfile()
      // 토큰 갱신 주체를 서버(미들웨어)로 모았으므로(browser autoRefreshToken off), 백그라운드
      // 복귀 시 realtime 이 최신 access token 을 쓰도록 다시 물린다. getSession 은 만료됐을 때만
      // on-demand 로 갱신하며, 이는 위 refetch(서버 갱신)와 같은 순간이라 10초 reuse 창에서 안전.
      // 일시 오류(네트워크 등)는 무시 — 다음 복귀에 재시도.
      void supabaseBrowser.auth
        .getSession()
        .then(({ data }) => {
          if (data.session) supabaseBrowser.realtime.setAuth(data.session.access_token)
        })
        .catch(() => {})
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
  }, [previewMode, refreshCases, refreshProfile])

  // 일정 알림(로컬 알림) 재예약 — 네이티브 앱 + 설정 ON + 권한 있을 때만(웹은 no-op).
  // 케이스가 실제로 바뀔 때만(업데이트 시각 기준) 재계산 — focus refetch 의 새 array reference 로
  // 매번 재예약되지 않도록 remindersKey 로 좁힌다.
  const remindersKey = useMemo(
    () => cases.map((c) => `${c.id}:${c.updated_at}`).join('|'),
    [cases],
  )
  useEffect(() => {
    if (previewMode) return
    let cancelled = false
    void (async () => {
      try {
        const { remindersEnabled, syncReminders } = await import('@/lib/native/local-reminders')
        if (cancelled || !remindersEnabled()) return
        const { collectReminders } = await import('@/lib/journey/reminders')
        await syncReminders(collectReminders(cases, new Date()))
      } catch {
        /* best-effort — 알림 재예약 실패가 앱을 막지 않게 */
      }
    })()
    return () => {
      cancelled = true
    }
    // cases 는 remindersKey(아이디+수정시각)로 대표 — 내용이 실제로 바뀔 때만 재실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindersKey, previewMode])

  // 서버 푸시(관리자 완료 알림) 기기 토큰 등록 — 네이티브 앱 + 알림 ON 일 때 앱 시작 1회.
  // 권한이 이미 있으면 추가 팝업 없이 토큰만 갱신(웹/미설정은 no-op). 설정에서 알림을 처음 켤
  // 때는 settings-view 가 직접 등록하므로, 여기는 이미 켜둔 채 앱을 재실행한 경우를 커버한다.
  //
  // ⚠️ register() 의 native+FCM 작업(최대 10초)이 첫 진입과 경쟁해 로그인→내 여정이 느려졌던
  // 회귀 → prefetch·realtime 처럼 **첫 진입 안정 후로 지연** 실행(토큰 등록은 급하지 않음).
  useEffect(() => {
    if (previewMode) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (cancelled) return
          const { remindersEnabled } = await import('@/lib/native/local-reminders')
          if (!remindersEnabled()) return
          const { registerAndSaveDeviceToken } = await import('@/lib/native/push-register')
          await registerAndSaveDeviceToken()
        } catch {
          /* best-effort — 토큰 등록 실패가 앱을 막지 않게 */
        }
      })()
    }, 4000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewMode])

  const value = useMemo(
    () => ({
      cases,
      profile,
      userEmail,
      partners,
      transportAvailable: initialTransportAvailable,
      refreshCases,
      refreshProfile,
      updateCase,
      updateProfile,
      removeCase,
    }),
    [cases, profile, userEmail, partners, initialTransportAvailable, refreshCases, refreshProfile, updateCase, updateProfile, removeCase],
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
