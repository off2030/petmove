'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'

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
  updateLocalCaseField: (
    caseId: string,
    storage: 'column' | 'data',
    key: string,
    value: unknown,
  ) => void
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

  const selectCase = useCallback((id: string | null) => {
    setSelectedId(id)
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
      updateLocalCaseField,
    }),
    [cases, fieldDefs, selectedId, selectCase, updateLocalCaseField],
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
