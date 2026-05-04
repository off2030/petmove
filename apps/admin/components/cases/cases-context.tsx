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
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { parseDestinations } from '@petmove/domain'
import type { InspectionConfig } from '@petmove/domain'
import type { CertConfig } from '@petmove/domain'
import { supabaseBrowser } from '@/lib/supabase/browser'
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
   * 상세페이지에 신고 버튼이 노출되는 국가 목록.
   * app_settings.import_report_button_countries 에서 초기 로드.
   */
  importReportButtonCountries: string[]
  setImportReportButtonCountries: (list: string[]) => void
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
  /**
   * 검사/신고/서류 탭 컬럼 표시 설정. organization_settings.todo_columns_config.
   * hiddenColumns[tab] 에 들어있는 키는 테이블 헤더·셀에서 제외.
   */
  todoColumnsConfig: TodoColumnsConfig
  setTodoColumnsConfig: (config: TodoColumnsConfig) => void
}

const CasesContext = createContext<CasesContextValue | null>(null)

export function CasesProvider({
  initialCases,
  fieldDefs,
  initialImportReportCountries,
  initialImportReportButtonCountries,
  initialInspectionConfig,
  initialCertConfig,
  initialTodoColumnsConfig = DEFAULT_TODO_COLUMNS_CONFIG,
  orgId = null,
  caseAssigneeEnabled = false,
  orgMembers = [],
  sharePresets = [],
  children,
}: {
  initialCases: CaseRow[]
  fieldDefs: FieldDefinition[]
  initialImportReportCountries: string[]
  initialImportReportButtonCountries: string[]
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDestination, setActiveDestination] = useState<string | null>(null)
  const [importReportCountries, setImportReportCountries] = useState<string[]>(initialImportReportCountries)
  const [importReportButtonCountries, setImportReportButtonCountries] = useState<string[]>(initialImportReportButtonCountries)
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig>(initialInspectionConfig)
  const [certConfig, setCertConfig] = useState<CertConfig>(initialCertConfig)
  const [todoColumnsConfig, setTodoColumnsConfig] = useState<TodoColumnsConfig>(initialTodoColumnsConfig)
  const [newCaseIds, setNewCaseIds] = useState<Set<string>>(() => new Set())
  // 본인이 직접 추가한(addLocalCase 또는 useEffect 내 직접 setCases) 케이스 id.
  // Realtime INSERT 가 같은 행을 다시 가져왔을 때 중복 처리 + "신규" 표식을 막는다.
  const selfAddedRef = useRef<Set<string>>(new Set())

  const selectCase = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) {
      setNewCaseIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  // ───── Realtime: 신청폼 신규 INSERT 구독 ─────
  // 같은 org 의 새 케이스가 들어오면 cases 배열에 즉시 추가 + 신규 표식.
  // 사용자가 행을 선택하면 표식 제거 (selectCase 안에서).
  useEffect(() => {
    if (!orgId) return
    const channel = supabaseBrowser
      .channel(`cases-realtime-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cases', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as CaseRow
          if (!row?.id) return
          // 본인이 추가한 케이스면 Realtime 콜백 무시 — 이미 addLocalCase 로 반영됨.
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
      .subscribe()
    return () => {
      supabaseBrowser.removeChannel(channel)
    }
  }, [orgId])

  // 검사/신고/서류 탭에서 행 클릭 시 호출. selectCase로 케이스 선택 후
  // /cases로 URL을 밀고 popstate를 발사해 DashboardShell이 탭 전환하도록 함.
  // origin 정보를 state에 남겨 "목록" 버튼에서 이전 탭으로 복귀 가능하게 함.
  const openCase = useCallback((id: string) => {
    setSelectedId(id)
    if (typeof window === 'undefined') return
    if (window.location.pathname !== '/cases') {
      const origin = window.location.pathname
      window.history.pushState({ caseDetailOrigin: origin }, '', '/cases')
      window.dispatchEvent(new PopStateEvent('popstate'))
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
  }, [])

  const removeLocalCase = useCallback((id: string) => {
    setCases((prev) => {
      const next = prev.filter((c) => c.id !== id)
      // Auto-select the first (latest) case after deletion
      setSelectedId(next.length > 0 ? next[0].id : null)
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
    ) => {
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c
          const now = new Date().toISOString()
          if (storage === 'column') {
            return { ...c, [key]: value, updated_at: now } as CaseRow
          }
          const nextData = {
            ...((c.data as Record<string, unknown>) ?? {}),
          }
          if (value === null || value === undefined || value === '') {
            delete nextData[key]
          } else {
            nextData[key] = value
          }
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
      importReportButtonCountries,
      setImportReportButtonCountries,
      inspectionConfig,
      setInspectionConfig,
      certConfig,
      setCertConfig,
      newCaseIds,
      caseAssigneeEnabled,
      orgMembers,
      sharePresets,
      todoColumnsConfig,
      setTodoColumnsConfig,
    }),
    [cases, fieldDefs, selectedId, selectCase, openCase, addLocalCase, removeLocalCase, updateLocalCaseField, replaceLocalCaseData, activeDestination, importReportCountries, importReportButtonCountries, inspectionConfig, certConfig, newCaseIds, caseAssigneeEnabled, orgMembers, sharePresets, todoColumnsConfig],
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
