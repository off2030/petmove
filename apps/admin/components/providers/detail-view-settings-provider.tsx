'use client'

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react'
import {
  DETAIL_VIEW_DEFAULTS,
  type DetailViewSettings,
} from '@/lib/detail-view-settings-types'

interface Ctx {
  settings: DetailViewSettings
  setSettings: Dispatch<SetStateAction<DetailViewSettings>>
}

const DetailViewSettingsCtx = createContext<Ctx | null>(null)

export function DetailViewSettingsProvider({
  initialSettings = DETAIL_VIEW_DEFAULTS,
  children,
}: {
  initialSettings?: DetailViewSettings
  children: React.ReactNode
}) {
  const [settings, setSettings] = useState<DetailViewSettings>(initialSettings)
  return (
    <DetailViewSettingsCtx.Provider value={{ settings, setSettings }}>
      {children}
    </DetailViewSettingsCtx.Provider>
  )
}

/**
 * Provider 밖에서 쓰일 가능성에 대비해 fallback (기본값 + no-op setter) 반환.
 * 케이스 상세 / 설정 페이지 모두 dashboard layout 하위에서만 마운트되므로 실제로는 항상 provider 안.
 */
export function useDetailViewSettings(): Ctx {
  const ctx = useContext(DetailViewSettingsCtx)
  if (!ctx) {
    return { settings: DETAIL_VIEW_DEFAULTS, setSettings: () => {} }
  }
  return ctx
}
