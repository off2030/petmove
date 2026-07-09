'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Sentry from '@sentry/nextjs'
import type { CaseRow, FieldDefinition } from '@petmove/domain'
import { parseDestinations, isDestinationScopedKey, writeByDestValue, clearExtraValueWithLegacy } from '@petmove/domain'
import type { InspectionConfig } from '@petmove/domain'
import type { CertConfig } from '@petmove/domain'
import { subscribeRealtime } from '@/lib/realtime/resilient-channel'
import { getActiveOrgCaseById, listActiveOrgCases } from '@/lib/actions/list-cases'
import type { SharePreset } from '@/lib/share-presets-types'
import { DEFAULT_TODO_COLUMNS_CONFIG, type TodoColumnsConfig } from '@/lib/todo-columns-config-types'

/**
 * Global client-side state for the cases app:
 *  - all cases loaded once from the server
 *  - selected case id (not in URL — pure in-memory state)
 *  - field_definitions used by the detail page
 *  - optimistic update helper for inline edits
 */
interface CasesContextValue {
  cases: CaseRow[]
  fieldDefs: FieldDefinition[]
  selectedId: string | null
  selectCase: (id: string | null) => void
  /**
   * 다른 탭(검사/신고/서류)에서 행 클릭 시 호출. 케이스 선택 + 상세페이지 탭으로 전환.
   */
  openCase: (id: string) => void
  addLocalCase: (newCase: CaseRow) => void
  removeLocalCase: (id: string) => void
  updateLocalCaseField: (
    caseId: string,
    storage: 'column' | 'data',
    key: string,
    value: unknown,
    /**
     * 다중 목적지 케이스에서 destination-scoped 키 입력 시 활성 목적지 토큰.
     * 지정 시 `data.by_dest[destination][key]` 로 로컬 상태 반영.
     */
    destination?: string | null,
  ) => void
  /** auto-fill 엔진 등 여러 필드가 한 번에 바뀔 때 data 객체 전체를 교체. */
  replaceLocalCaseData: (caseId: string, data: Record<string, unknown>) => void
  /**
   * 선택된 케이스의 목적지 여럿 중 "현재 활성" 목적지. 단일 목적지면 그 값.
   * 상세페이지 필드 필터·증명서 버튼·검증 기준이 됨. DB 저장 안 함.
   */
  activeDestination: string | null
  setActiveDestination: (dest: string | null) => void
  /**
   * 신고 탭 자동 포함 대상 국가 목록. 설정 화면에서 편집 가능.
   * app_settings.import_report_countries 에서 초기 로드.
   */
  importReportCountries: string[]
  setImportReportCountries: (list: string[]) => void
  /**
   * 광견병항체·전염병검사 기관 설정(국가별 오버라이드 포함).
   * app_settings.inspection_config 에서 초기 로드.
   */
  inspectionConfig: InspectionConfig
  setInspectionConfig: (config: InspectionConfig) => void
  /**
   * 증명서 국가별 설정. app_settings.cert_config 에서 초기 로드.
   */
  certConfig: CertConfig
  setCertConfig: (config: CertConfig) => void
  /**
   * 신규(Realtime INSERT 로 들어온) 케이스 id 모음. 사용자가 해당 행을 선택하면 제거.
   * 케이스 리스트에서 시각적 강조에 사용.
   */
  newCaseIds: Set<string>
  /**
   * 케이스 담당자 기능 (organization_settings.case_assignee.enabled).
   * true 일 때만 케이스 상세에 담당자 드롭다운 노출.
   */
  caseAssigneeEnabled: boolean
  /** 본인 조직 멤버 목록 — 담당자 picker 옵션. */
  orgMembers: Array<{ user_id: string; name: string | null; email: string }>
  /** 공유 링크 발급 시 빠른 선택용 사용자 정의 프리셋. */
  sharePresets: SharePreset[]
  setSharePresets: (list: SharePreset[]) => void
  /**
   * 검사/신고/서류 탭 컬럼 표시 설정. organization_settings.todo_columns_config.
   * hiddenColumns[tab] 에 들어있는 키는 테이블 헤더·셀에서 제외.
   */
  todoColumnsConfig: TodoColumnsConfig
  setTodoColumnsConfig: (config: TodoColumnsConfig) => void
  /** 케이스 목록 검색어. 좌측 목록 + 케이스 상세 좌우 네비게이션이 같은 검색 결과를 공유. */
  searchQuery: string
  setSearchQuery: (q: string) => void
  /**
   * 케이스 상세 좌우 화살표가 순회할 케이스 id 순서.
   * 현재 보고 있는 목록(고객 목록 / 검사·신고·서류 탭)이 자신의 정렬·필터 결과를
   * 여기에 publish 하고, 상세페이지는 이 순서로 이전/다음을 계산한다.
   */
  navCaseIds: string[]
  setNavCaseIds: (ids: string[]) => void
}

const CasesContext = createContext<CasesContextValue | null>(null)

// ───── 선택된 케이스 id 의 URL 영속화 ─────
// selectedId 는 클라이언트 메모리 상태라, 필드 저장 후 revalidatePath('/cases')
// 리프레시 + 배포 버전 스큐 등으로 (dashboard) 레이아웃이 리마운트/리로드되면
// 상세 화면이 목록으로 "튕긴다". /cases?case=<id> 로 URL 에 적어두면 어떤
// 리마운트가 일어나도 마운트 시 URL 에서 복원된다.
//
// 라우팅은 탭 전환과 동일하게 raw History API 로만 — Next 라우터를 거치지 않아
// 추가 RSC refetch 가 없다. 목록에서의 선택은 history 항목을 만들지 않던 기존
// 동작을 유지하기 위해 replaceState 사용.
// URL 이 어떤 코드 경로에서 ?case= 를 잃거나(예: 미래의 tab 전환·라우터 변경이 query
// 를 함께 지우는 회귀) Next 라우터가 query 누락 상태로 history 를 갱신할 가능성에 대비
// 한 두 번째 layer. URL 을 우선 읽고, 없으면 sessionStorage 에서 복원. 41c2953 참고.
const SELECTED_CASE_STORAGE_KEY = 'petmove:cases:selected-id'

function readCaseIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('case')
}

function readStoredCaseId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(SELECTED_CASE_STORAGE_KEY)
  } catch {
    return null
  }
}

function syncCaseIdToUrl(id: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('case', id)
  else url.searchParams.delete('case')
  window.history.replaceState(window.history.state, '', url)
  try {
    if (id) window.sessionStorage.setItem(SELECTED_CASE_STORAGE_KEY, id)
    else window.sessionStorage.removeItem(SELECTED_CASE_STORAGE_KEY)
  } catch {}
}

export function CasesProvider({
  initialCases,
  fieldDefs,
  initialImportReportCountries,
  initialInspectionConfig,
  initialCertConfig,
  initialTodoColumnsConfig = DEFAULT_TODO_COLUMNS_CONFIG,
  orgId = null,
  caseAssigneeEnabled = false,
  orgMembers = [],
  sharePresets: initialSharePresets = [],
  children,
}: {
  initialCases: CaseRow[]
  fieldDefs: FieldDefinition[]
  initialImportReportCountries: string[]
  initialInspectionConfig: InspectionConfig
  initialCertConfig: CertConfig
  initialTodoColumnsConfig?: TodoColumnsConfig
  orgId?: string | null
  caseAssigneeEnabled?: boolean
  orgMembers?: Array<{ user_id: string; name: string | null; email: string }>
  sharePresets?: SharePreset[]
  children: React.ReactNode
}) {
  const [cases, setCases] = useState<CaseRow[]>(initialCases)
  // 마운트 시 URL 에서 복원. 목록 조회가 일시적으로 비어도 case id 는 보존한 뒤
  // 아래 effect 에서 단일 조회로 확인한다.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return readCaseIdFromUrl() ?? readStoredCaseId()
  })
  const [activeDestination, setActiveDestination] = useState<string | null>(null)
  const [importReportCountries, setImportReportCountries] = useState<string[]>(initialImportReportCountries)
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig>(initialInspectionConfig)
  const [certConfig, setCertConfig] = useState<CertConfig>(initialCertConfig)
  const [todoColumnsConfig, setTodoColumnsConfig] = useState<TodoColumnsConfig>(initialTodoColumnsConfig)
  const [sharePresets, setSharePresets] = useState<SharePreset[]>(initialSharePresets)
  const [newCaseIds, setNewCaseIds] = useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [navCaseIds, setNavCaseIds] = useState<string[]>([])
  // 본인이 직접 추가한(addLocalCase 또는 useEffect 내 직접 setCases) 케이스 id.
  // Realtime INSERT 가 같은 행을 다시 가져왔을 때 중복 처리 + "신규" 표식을 막는다.
  const selfAddedRef = useRef<Set<string>>(new Set())
  // Realtime 재연결 시 onSubscribed 콜백이 stale closure 없이 현재 목록을 읽도록.
  const casesRef = useRef(cases)
  useEffect(() => {
    casesRef.current = cases
  }, [cases])

  // ── 임시 진단(DIAG-REMOUNT) ─────────────────────────────────────────────
  // "상세→목록 튕김" 의 가설: (dashboard) 레이아웃이 어떤 트리거로 리마운트
  // → CasesProvider 도 새 인스턴스 → URL/sessionStorage 가 깨져 있으면 첫화면 노출.
  //
  // 이 effect 는 CasesProvider 가 짧은 간격(5초 이내) 으로 재마운트되는 경우만
  // Sentry + console.warn 으로 보고. 정상 사용엔 영향 없음. 재발이 안정적으로
  // 진단되면 통째로 제거(grep "DIAG-REMOUNT").
  useEffect(() => {
    if (typeof window === 'undefined') return
    const LAST_MOUNT_KEY = 'petmove:diag:cases-provider-last-mount'
    const THRESHOLD_MS = 5_000
    const now = Date.now()
    let prev: number | null = null
    try {
      const raw = window.sessionStorage.getItem(LAST_MOUNT_KEY)
      if (raw) prev = parseInt(raw, 10)
    } catch {}
    try {
      window.sessionStorage.setItem(LAST_MOUNT_KEY, String(now))
    } catch {}
    if (prev && now - prev < THRESHOLD_MS) {
      const ctx = {
        gap_ms: now - prev,
        url: window.location.href,
        url_case: readCaseIdFromUrl(),
        storage_case: readStoredCaseId(),
        initial_cases_count: cases.length,
      }
      console.warn('[DIAG-REMOUNT] CasesProvider quick remount', ctx)
      Sentry.captureMessage('CasesProvider quick remount', {
        level: 'warning',
        extra: ctx,
      })
    }
    // mount-only — cases.length 는 진단 컨텍스트 용도라 deps 에 의도적으로 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL 의 case 파라미터가 현재 목록에 없으면 단일 조회로 복원한다.
  // 조회 자체가 실패하면 인증 refresh/RLS/네트워크 타이밍일 수 있으므로 URL 을 지우지 않는다.
  // "정상 조회 결과 없음" 이 확인될 때만 stale id 로 보고 정리한다.
  useEffect(() => {
    if (!selectedId) return
    if (cases.some((c) => c.id === selectedId)) return

    let alive = true
    void (async () => {
      const result = await getActiveOrgCaseById(selectedId)
      if (!alive) return

      if (!result.ok) return
      const restoredCase = result.case
      if (restoredCase) {
        setCases((prev) => {
          if (prev.some((c) => c.id === restoredCase.id)) return prev
          return [restoredCase, ...prev]
        })
      }
    })()

    return () => {
      alive = false
    }
  }, [cases, selectedId])

  const selectCase = useCallback((id: string | null) => {
    setSelectedId(id)
    syncCaseIdToUrl(id)
    if (id) {
      setNewCaseIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  useEffect(() => {
    function onPopState() {
      setSelectedId(readCaseIdFromUrl())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // ───── Realtime: 신청폼 신규 INSERT 구독 ─────
  // 같은 org 의 새 케이스가 들어오면 cases 배열에 즉시 추가 + 신규 표식.
  // 사용자가 행을 선택하면 표식 제거 (selectCase 안에서).
  //
  // subscribeRealtime 이 setAuth·재연결·토큰갱신을 자체 관리한다. 재연결 시
  // onSubscribed 가 전체 목록을 다시 받아 끊긴 동안 놓친 INSERT 를 보충한다 —
  // postgres_changes 는 downtime 이벤트를 replay 하지 않으므로 필수.
  useEffect(() => {
    if (!orgId) return
    let isFirstSubscribe = true

    return subscribeRealtime(
      `cases-realtime-${orgId}`,
      (channel) =>
        channel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'cases', filter: `org_id=eq.${orgId}` },
            (payload) => {
              const row = payload.new as CaseRow
              if (!row?.id) return
              // 본인이 추가한 케이스면 무시 — 이미 addLocalCase 로 반영됨.
              if (selfAddedRef.current.has(row.id)) {
                selfAddedRef.current.delete(row.id)
                return
              }
              setCases((prev) => {
                if (prev.some((c) => c.id === row.id)) return prev
                return [row, ...prev]
              })
              setNewCaseIds((prev) => {
                const next = new Set(prev)
                next.add(row.id)
                return next
              })
            },
          )
          // 공유 폼 제출·다른 세션 편집 등 외부 UPDATE 를 즉시 반영.
          // 본인 inline edit 는 updateLocalCaseField 가 선반영 → 같은 데이터로 도착해도 무해.
          //
          // P1 #6 — updated_at 동일하면 phantom UPDATE (트리거·autoFill 의 no-op publish
          // 등) 로 간주하고 prev 객체 유지. CaseRowItem memo 가 그 행 재렌더 안 하도록.
          // updated_at 이 다르면 정상 변경 — payload.new 전체로 교체.
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'cases', filter: `org_id=eq.${orgId}` },
            (payload) => {
              const row = payload.new as CaseRow
              if (!row?.id) return
              // Realtime 은 행이 max_record_bytes(기본 1MB) 를 넘으면 payload 를 잘라
              // 보낸다 — 작은 컬럼(customer_name·microchip 등)은 남고 큰 data(jsonb)
              // 컬럼이 비거나 누락된다. 이 잘린 payload 로 캐시를 덮으면 화면에서
              // 고객·동물 정보가 통째로 사라진다(DB 는 멀쩡, 새로고침하면 복구).
              // 잘린 신호가 보이면 payload 를 신뢰하지 말고 권위 행을 재fetch 한다.
              const cached = casesRef.current.find((c) => c.id === row.id)
              if (cached?.updated_at && cached.updated_at === row.updated_at) return
              const errs = (payload as { errors?: unknown[] }).errors
              const hasErrors = Array.isArray(errs) && errs.length > 0
              const incomingEmpty =
                row.data == null ||
                (typeof row.data === 'object' && Object.keys(row.data as object).length === 0)
              const cachedHasData =
                !!cached?.data &&
                typeof cached.data === 'object' &&
                Object.keys(cached.data as object).length > 0
              if (hasErrors || (incomingEmpty && cachedHasData)) {
                // 잘린 payload — 덮어쓰지 않고 권위 행을 다시 읽어 정확한 data 회복.
                // 그 사이 기존 캐시는 그대로 유지(화면 보존).
                void getActiveOrgCaseById(row.id).then((res) => {
                  if (res.ok && res.case) {
                    const full = res.case
                    setCases((prev) => prev.map((c) => (c.id === full.id ? full : c)))
                  }
                })
                return
              }
              setCases((prev) =>
                prev.map((c) => {
                  if (c.id !== row.id) return c
                  if (c.updated_at && c.updated_at === row.updated_at) return c
                  return row
                }),
              )
            },
          ),
      () => {
        // 최초 구독은 initialCases 가 이미 최신이라 스킵. 재연결 시에만 보충.
        if (isFirstSubscribe) {
          isFirstSubscribe = false
          return
        }
        void (async () => {
          let fresh: CaseRow[]
          try {
            fresh = await listActiveOrgCases()
          } catch {
            return
          }
          // 재연결 직후 token refresh/visibilitychange 등의 race 로 getActiveOrgId()
          // 가 일시적으로 throw → listActiveOrgCases() 가 조용히 [] 를 반환할 수 있다.
          // 이 결과로 setCases([]) 를 그대로 적용하면 사용자의 상세 화면이 빈 패널로
          // 변하거나(혹은 restoration 이 case:null 응답을 받으면) 선택이 풀려서 목록
          // 으로 튕긴다. 이전에 케이스가 있었던 상태에서 빈 결과가 오면 보존한다 —
          // 진짜 0건은 다음 정상 reconnect 또는 Realtime DELETE 가 반영한다.
          if (fresh.length === 0 && casesRef.current.length > 0) return

          const prevIds = new Set(casesRef.current.map((c) => c.id))
          const arrivedIds = fresh
            .filter((c) => !prevIds.has(c.id) && !selfAddedRef.current.has(c.id))
            .map((c) => c.id)
          setCases(fresh)
          if (arrivedIds.length > 0) {
            setNewCaseIds((prev) => {
              const next = new Set(prev)
              for (const id of arrivedIds) next.add(id)
              return next
            })
          }
        })()
      },
    )
  }, [orgId])

  // 조직 전환(슈퍼어드민 임퍼소네이션 set/clear) 시 '신규' 표식 초기화.
  // org_id 가 바뀌는 전환 도중, 직전 org 의 구독(onSubscribed)이 재연결되며 listActiveOrgCases()
  // 가 이미 바뀐 새 org 의 전체 목록을 받아 와, 옛 org 기준으로 diff → 전부 '신규'로 잡히던 문제.
  // 데이터는 멀쩡하고 화면의 신규 표식만 잘못 붙으므로, org 가 바뀌면 표식을 비운다.
  useEffect(() => {
    setNewCaseIds(new Set<string>())
  }, [orgId])

  // 검사/신고/서류 탭에서 행 클릭 시 호출. selectCase로 케이스 선택 후
  // /cases로 URL을 밀고 popstate를 발사해 DashboardShell이 탭 전환하도록 함.
  // origin 정보를 state에 남겨 "목록" 버튼에서 이전 탭으로 복귀 가능하게 함.
  const openCase = useCallback((id: string) => {
    setSelectedId(id)
    if (typeof window === 'undefined') return
    if (window.location.pathname !== '/cases') {
      const origin = window.location.pathname
      window.history.pushState({ caseDetailOrigin: origin }, '', `/cases?case=${id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else {
      syncCaseIdToUrl(id)
    }
  }, [])

  // Reset active destination to the first token of the newly selected case,
  // or when the selected case's destination column changes underneath us.
  const selectedCase = cases.find(c => c.id === selectedId) ?? null
  const destTokens = parseDestinations(selectedCase?.destination ?? null)
  const firstDest = destTokens[0] ?? null
  useEffect(() => {
    if (!selectedId) { setActiveDestination(null); return }
    setActiveDestination(prev => (prev && destTokens.includes(prev) ? prev : firstDest))
    // re-run only when the selected case id or the destination string changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedCase?.destination])

  const addLocalCase = useCallback((newCase: CaseRow) => {
    selfAddedRef.current.add(newCase.id)
    setCases((prev) => [newCase, ...prev])
    setSelectedId(newCase.id)
    syncCaseIdToUrl(newCase.id)
  }, [])

  const removeLocalCase = useCallback((id: string) => {
    setCases((prev) => {
      const next = prev.filter((c) => c.id !== id)
      // Auto-select the first (latest) case after deletion
      const nextId = next.length > 0 ? next[0].id : null
      setSelectedId(nextId)
      syncCaseIdToUrl(nextId)
      return next
    })
  }, [])

  const replaceLocalCaseData = useCallback(
    (caseId: string, data: Record<string, unknown>) => {
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, data, updated_at: new Date().toISOString() } : c)),
      )
    },
    [],
  )

  const updateLocalCaseField = useCallback(
    (
      caseId: string,
      storage: 'column' | 'data',
      key: string,
      value: unknown,
      destination?: string | null,
    ) => {
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c
          const now = new Date().toISOString()
          // by_dest 경로 — 서버 updateCaseField 와 동일하게 destination 지정 + scoped 키면
          // 단일 목적지도 by_dest 에 반영한다. 표시 헬퍼는 by_dest 를 먼저 읽고, 서버가
          // 필요한 legacy column 동기화를 뒤따라 보낸다.
          if (destination && isDestinationScopedKey(key)) {
            const nextData = writeByDestValue(
              (c.data as Record<string, unknown>) ?? null,
              destination,
              key,
              value,
            )
            return { ...c, data: nextData, updated_at: now } as CaseRow
          }
          if (storage === 'column') {
            return { ...c, [key]: value, updated_at: now } as CaseRow
          }
          if (value === null || value === undefined || value === '') {
            // 서버 updateCaseField 와 동일 — top-level + legacy *_extra 잔존까지 제거해
            // read fallback 으로 옛 값이 부활하지 않게(해외주소 등 삭제가 즉시 반영되도록).
            const nextData = clearExtraValueWithLegacy(
              (c.data as Record<string, unknown>) ?? null,
              key,
            )
            return { ...c, data: nextData, updated_at: now } as CaseRow
          }
          const nextData = {
            ...((c.data as Record<string, unknown>) ?? {}),
          }
          nextData[key] = value
          return { ...c, data: nextData, updated_at: now } as CaseRow
        }),
      )
    },
    [],
  )

  const value = useMemo<CasesContextValue>(
    () => ({
      cases,
      fieldDefs,
      selectedId,
      selectCase,
      openCase,
      addLocalCase,
      removeLocalCase,
      updateLocalCaseField,
      replaceLocalCaseData,
      activeDestination,
      setActiveDestination,
      importReportCountries,
      setImportReportCountries,
      inspectionConfig,
      setInspectionConfig,
      certConfig,
      setCertConfig,
      newCaseIds,
      caseAssigneeEnabled,
      orgMembers,
      sharePresets,
      setSharePresets,
      todoColumnsConfig,
      setTodoColumnsConfig,
      searchQuery,
      setSearchQuery,
      navCaseIds,
      setNavCaseIds,
    }),
    [cases, fieldDefs, selectedId, selectCase, openCase, addLocalCase, removeLocalCase, updateLocalCaseField, replaceLocalCaseData, activeDestination, importReportCountries, inspectionConfig, certConfig, newCaseIds, caseAssigneeEnabled, orgMembers, sharePresets, setSharePresets, todoColumnsConfig, searchQuery, navCaseIds],
  )

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>
}

export function useCases() {
  const ctx = useContext(CasesContext)
  if (!ctx) {
    throw new Error('useCases must be used inside a CasesProvider')
  }
  return ctx
}
