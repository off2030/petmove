'use client'

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react'
import { EMPTY_DESTINATION_OVERRIDES, type DestinationOverridesConfig } from '@petmove/domain'

interface Ctx {
  config: DestinationOverridesConfig
  setConfig: Dispatch<SetStateAction<DestinationOverridesConfig>>
}

const DestinationOverridesCtx = createContext<Ctx | null>(null)

export function DestinationOverridesProvider({
  initialConfig = EMPTY_DESTINATION_OVERRIDES,
  children,
}: {
  initialConfig?: DestinationOverridesConfig
  children: React.ReactNode
}) {
  const [config, setConfig] = useState<DestinationOverridesConfig>(initialConfig)
  return (
    <DestinationOverridesCtx.Provider value={{ config, setConfig }}>
      {children}
    </DestinationOverridesCtx.Provider>
  )
}

/** Provider 밖에서도 깨지지 않게 빈 설정 fallback. */
export function useDestinationOverrides(): Ctx {
  const ctx = useContext(DestinationOverridesCtx)
  if (!ctx) {
    return {
      config: EMPTY_DESTINATION_OVERRIDES,
      setConfig: () => {},
    }
  }
  return ctx
}
