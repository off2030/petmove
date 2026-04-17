'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { parseDestinations } from '@/lib/destination-config'

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
  addLocalCase: (newCase: CaseRow) => void
  removeLocalCase: (id: string) => void
  updateLocalCaseField: (
    caseId: string,
    storage: 'column' | 'data',
    key: string,
    value: unknown,
  ) => void
  /**
   * 선택된 케이스의 목적지 여럿 중 "현재 활성" 목적지. 단일 목적지면 그 값.
   * 상세페이지 필드 필터·증명서 버튼·검증 기준이 됨. DB 저장 안 함.
   */
  activeDestination: string | null
  setActiveDestination: (dest: string | null) => void
}

const CasesContext = createContext<CasesContextValue | null>(null)

export function CasesProvider({
  initialCases,
  fieldDefs,
  children,
}: {
  initialCases: CaseRow[]
  fieldDefs: FieldDefinition[]
  children: React.ReactNode
}) {
  const [cases, setCases] = useState<CaseRow[]>(initialCases)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDestination, setActiveDestination] = useState<string | null>(null)

  const selectCase = useCallback((id: string | null) => {
    setSelectedId(id)
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
      addLocalCase,
      removeLocalCase,
      updateLocalCaseField,
      activeDestination,
      setActiveDestination,
    }),
    [cases, fieldDefs, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField, activeDestination],
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
