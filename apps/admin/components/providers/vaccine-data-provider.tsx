'use client'

import { createContext, useContext, useMemo } from 'react'
import {
  createVaccineLookups,
  emptyVaccineProductsData,
  type VaccineLookups,
  type VaccineProductsData,
} from '@petmove/domain'

const FALLBACK = createVaccineLookups(emptyVaccineProductsData())

const Ctx = createContext<VaccineLookups>(FALLBACK)

export function VaccineDataProvider({
  data,
  children,
}: {
  data: VaccineProductsData
  children: React.ReactNode
}) {
  const lookups = useMemo(() => createVaccineLookups(data), [data])
  return <Ctx.Provider value={lookups}>{children}</Ctx.Provider>
}

/**
 * Active org 의 vaccine lookups. Provider 밖에서 호출되면 빈 데이터(empty) 를 바인딩한
 * fallback lookups 반환 — super-admin 처럼 dashboard layout 밖에서 mount 되는 경우 대응.
 */
export function useVaccineLookups(): VaccineLookups {
  return useContext(Ctx)
}
