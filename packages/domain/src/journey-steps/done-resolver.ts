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
import { buildCaseJourneyContext } from './applicability'

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
    case 'microchip-set': {
      // 칩 번호 + 시술일 모두 입력되어야 완료. 시술일은 광견병 1차 백신 'after-microchip'
      // 체크의 기준일이라 없으면 후속 단계 검증이 무력화됨.
      if (!caseRow.microchip || caseRow.microchip.length === 0) return false
      const implant = data.microchip_implant_date
      return typeof implant === 'string' && implant.length >= 10
    }
    case 'has-rabies-entry':
      return readRabiesEntries(caseRow).length > 0
    case 'has-rabies-booster':
      return readRabiesEntries(caseRow).length >= 2
    case 'has-extra-rabies':
      return readRabiesEntries(caseRow).length >= 3
    case 'has-titer-entry':
      return readTiterEntries(caseRow).length > 0
    case 'has-extra-titer':
      return readTiterEntries(caseRow).length >= 2
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
    case 'has-flight-date':
      return typeof data.entry_date === 'string' && (data.entry_date as string).length >= 10
    case 'has-advance-notification':
      return (
        typeof data.advance_notification_date === 'string' &&
        (data.advance_notification_date as string).length >= 10
      )
    case 'has-jp-export-quarantine':
      return (
        typeof data.jp_export_quarantine_date === 'string' &&
        (data.jp_export_quarantine_date as string).length >= 10
      )
    case 'has-kr-export-quarantine':
      return (
        typeof data.kr_export_quarantine_date === 'string' &&
        (data.kr_export_quarantine_date as string).length >= 10
      )
    case 'has-jp-import-quarantine':
      return (
        typeof data.jp_import_quarantine_date === 'string' &&
        (data.jp_import_quarantine_date as string).length >= 10
      )
    case 'has-jp-export-quarantine-visit':
      return (
        typeof data.jp_export_quarantine_visit_date === 'string' &&
        (data.jp_export_quarantine_visit_date as string).length >= 10
      )
    case 'has-kr-import-quarantine':
      return (
        typeof data.kr_import_quarantine_date === 'string' &&
        (data.kr_import_quarantine_date as string).length >= 10
      )
    case 'has-arrived': {
      // 도착 완료 — 왕복은 한국 수입검역, 편도는 일본 수입검역(있으면) / 출국일 경과.
      const { tripType } = buildCaseJourneyContext(caseRow)
      if (tripType === 'round') {
        return (
          typeof data.kr_import_quarantine_date === 'string' &&
          (data.kr_import_quarantine_date as string).length >= 10
        )
      }
      if (
        typeof data.jp_import_quarantine_date === 'string' &&
        (data.jp_import_quarantine_date as string).length >= 10
      ) {
        return true
      }
      return !!caseRow.departure_date && caseRow.departure_date < todayIso()
    }
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

/**
 * done 시그널 → "완료된 시점" 의 ISO date('YYYY-MM-DD'). resolveDone 이 true 일 때만 의미.
 *
 * 데이터에 시점이 명시되어 있지 않은 시그널(manual-flag:*)은 null. UI 는 null 일 때
 * 표시를 비우거나 fallback 을 쓰면 됨.
 */
export function resolveCompletedDate(signal: StepDoneSignal, caseRow: CaseRow): string | null {
  // manual-flag 토글 시점은 별도 저장되지 않음 — 표시할 날짜 없음.
  if (typeof signal === 'string' && signal.startsWith('manual-flag:')) return null

  const data = (caseRow.data ?? {}) as Record<string, unknown>

  switch (signal) {
    case 'always-done':
      // intake — 케이스 생성일. 가입/등록 시점이라 가장 직관적.
      return caseRow.created_at ? caseRow.created_at.slice(0, 10) : null
    case 'microchip-set': {
      const dt = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : null
      if (dt && dt.length >= 10) return dt.slice(0, 10)
      // 시술일 미입력 시 — 칩 번호 등록 시점이 명확치 않아 케이스 생성일로 fallback.
      return caseRow.created_at ? caseRow.created_at.slice(0, 10) : null
    }
    case 'has-rabies-entry': {
      // 1차 = 가장 이른 광견병 접종일 (readRabiesEntries 는 날짜 오름차순 정렬)
      const r = readRabiesEntries(caseRow)
      return r.length > 0 ? r[0].date : null
    }
    case 'has-rabies-booster': {
      // 2차 = 두 번째 광견병 접종일
      const r = readRabiesEntries(caseRow)
      return r.length >= 2 ? r[1].date : null
    }
    case 'has-extra-rabies': {
      // 추가 접종(3차+) = 가장 최근 접종일 (readRabiesEntries 는 오름차순 정렬)
      const r = readRabiesEntries(caseRow)
      return r.length >= 3 ? r[r.length - 1].date : null
    }
    case 'has-titer-entry': {
      // 1회차 = 가장 이른 항체검사일 (180일 대기·2년 입국 기한의 기준일).
      // 광견병 백신(has-rabies-entry)이 r[0]=1차 인 것과 동일 컨벤션.
      const dates = readTiterEntries(caseRow)
        .map((e) => e.date)
        .filter((d): d is string => typeof d === 'string' && d.length >= 10)
      if (dates.length === 0) return null
      return dates.slice().sort()[0]
    }
    case 'has-extra-titer': {
      // 추가 항체검사(2회+) = 가장 최근 검사일.
      const dates = readTiterEntries(caseRow)
        .map((e) => e.date)
        .filter((d) => typeof d === 'string' && d.length >= 10)
      if (dates.length < 2) return null
      return dates.slice().sort().slice(-1)[0]
    }
    case 'has-general-vaccine':
      return lastEntryDate(readGeneralVaccineEntries(caseRow).map((e) => e.date))
    case 'has-civ-vaccine':
      return lastEntryDate(readCivEntries(caseRow).map((e) => e.date))
    case 'has-infectious-disease-test':
      return lastEntryDate(readInfectiousDiseaseEntries(caseRow).map((e) => e.date))
    case 'has-internal-parasite':
      return lastEntryDate(readInternalParasiteEntries(caseRow).map((e) => e.date))
    case 'has-external-parasite':
      return lastEntryDate(readExternalParasiteEntries(caseRow).map((e) => e.date))
    case 'has-deworming-time': {
      const dt = typeof data.deworming_time === 'string' ? data.deworming_time : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-vet-visit': {
      const dt = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-flight-date': {
      const dt = typeof data.entry_date === 'string' ? data.entry_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-advance-notification': {
      const dt =
        typeof data.advance_notification_date === 'string' ? data.advance_notification_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-jp-export-quarantine': {
      const dt =
        typeof data.jp_export_quarantine_date === 'string' ? data.jp_export_quarantine_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-kr-export-quarantine': {
      const dt =
        typeof data.kr_export_quarantine_date === 'string' ? data.kr_export_quarantine_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-jp-import-quarantine': {
      const dt =
        typeof data.jp_import_quarantine_date === 'string' ? data.jp_import_quarantine_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-jp-export-quarantine-visit': {
      const dt =
        typeof data.jp_export_quarantine_visit_date === 'string'
          ? data.jp_export_quarantine_visit_date
          : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-kr-import-quarantine': {
      const dt =
        typeof data.kr_import_quarantine_date === 'string' ? data.kr_import_quarantine_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-arrived': {
      const { tripType } = buildCaseJourneyContext(caseRow)
      if (tripType === 'round') {
        const dt =
          typeof data.kr_import_quarantine_date === 'string' ? data.kr_import_quarantine_date : null
        return dt && dt.length >= 10 ? dt.slice(0, 10) : null
      }
      const jp =
        typeof data.jp_import_quarantine_date === 'string' ? data.jp_import_quarantine_date : null
      if (jp && jp.length >= 10) return jp.slice(0, 10)
      return caseRow.departure_date ?? null
    }
    case 'departure-past':
      return caseRow.departure_date ?? null
    default:
      return null
  }
}

function lastEntryDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  // reader 별 sort 정책이 일관되지 않아 여기서 max 를 직접 뽑음.
  return dates.slice().sort().slice(-1)[0]
}
