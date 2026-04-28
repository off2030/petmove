'use client'

import { createContext, useContext, useMemo } from 'react'
import {
  createVaccineLookups,
  emptyVaccineProductsData,
  type VaccineDefaults,
  type VaccineLookups,
  type VaccineProductsData,
} from '@petmove/domain'

const FALLBACK = createVaccineLookups(emptyVaccineProductsData())

const Ctx = createContext<VaccineLookups>(FALLBACK)
const DataCtx = createContext<VaccineProductsData>(emptyVaccineProductsData())
const DefaultsCtx = createContext<VaccineDefaults>({})

export function VaccineDataProvider({
  data,
  defaults,
  children,
}: {
  data: VaccineProductsData
  defaults?: VaccineDefaults
  children: React.ReactNode
}) {
  const def = defaults ?? {}
  const lookups = useMemo(() => createVaccineLookups(data, def), [data, def])
  return (
    <Ctx.Provider value={lookups}>
      <DataCtx.Provider value={data}>
        <DefaultsCtx.Provider value={def}>{children}</DefaultsCtx.Provider>
      </DataCtx.Provider>
    </Ctx.Provider>
  )
}

/**
 * Active org 의 vaccine lookups. Provider 밖에서 호출되면 빈 데이터(empty) 를 바인딩한
 * fallback lookups 반환 — super-admin 처럼 dashboard layout 밖에서 mount 되는 경우 대응.
 */
export function useVaccineLookups(): VaccineLookups {
  return useContext(Ctx)
}

export function useVaccineData(): VaccineProductsData {
  return useContext(DataCtx)
}

export function useVaccineDefaults(): VaccineDefaults {
  return useContext(DefaultsCtx)
}
