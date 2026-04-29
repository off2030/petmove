'use client'

import { createContext, useContext } from 'react'

/**
 * 섹션별 편집 모드 — 절차정보·추가정보는 읽기/편집 모드 토글, 그 외는 항상 편집 가능.
 * 기본값 true → Provider 로 감싸지 않은 섹션(고객정보·동물정보 등)은 기존처럼 즉각 편집.
 */
const SectionEditModeContext = createContext<boolean>(true)

export function SectionEditModeProvider({
  value,
  children,
}: {
  value: boolean
  children: React.ReactNode
}) {
  return (
    <SectionEditModeContext.Provider value={value}>
      {children}
    </SectionEditModeContext.Provider>
  )
}

export function useSectionEditMode(): boolean {
  return useContext(SectionEditModeContext)
}
