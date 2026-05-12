import type { CaseRow } from '../types'
import {
  readGeneralVaccineEntries,
  readCivEntries,
  readExternalParasiteEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
} from '../procedure-checks/utils'
import type { StepDoneSignal } from './types'

/**
 * doneSignal → boolean. 단일 dispatcher.
 *
 * 새 시그널 추가 시:
 * 1) types.ts 의 StepDoneSignal union 에 추가
 * 2) 이 switch 에 case 추가
 */
export function resolveDone(signal: StepDoneSignal, caseRow: CaseRow): boolean {
  // manual-flag:<key> 는 case.data.journey_flags.<key> 를 본다
  if (typeof signal === 'string' && signal.startsWith('manual-flag:')) {
    const key = signal.slice('manual-flag:'.length)
    const flags = (caseRow.data as Record<string, unknown> | null)?.journey_flags
    if (flags && typeof flags === 'object') {
      return (flags as Record<string, unknown>)[key] === true
    }
    return false
  }

  const data = (caseRow.data ?? {}) as Record<string, unknown>

  switch (signal) {
    case 'always-done':
      return true
    case 'microchip-set':
      return !!caseRow.microchip && caseRow.microchip.length > 0
    case 'has-rabies-entry':
      return readRabiesEntries(caseRow).length > 0
    case 'has-rabies-booster':
      return readRabiesEntries(caseRow).length >= 2
    case 'has-titer-entry':
      return readTiterEntries(caseRow).length > 0
    case 'has-general-vaccine':
      return readGeneralVaccineEntries(caseRow).length > 0
    case 'has-civ-vaccine':
      return readCivEntries(caseRow).length > 0
    case 'has-infectious-disease-test':
      return readInfectiousDiseaseEntries(caseRow).length > 0
    case 'has-internal-parasite':
      return readInternalParasiteEntries(caseRow).length > 0
    case 'has-external-parasite':
      return readExternalParasiteEntries(caseRow).length > 0
    case 'has-deworming-time':
      return typeof data.deworming_time === 'string' && (data.deworming_time as string).length > 0
    case 'has-vet-visit':
      return typeof data.vet_visit_date === 'string' && (data.vet_visit_date as string).length >= 10
    case 'departure-past': {
      const dep = caseRow.departure_date
      if (!dep) return false
      return dep < todayIso()
    }
    default:
      return false
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
