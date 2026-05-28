import type { CaseRow } from '../types'
import {
  addYears,
  readGeneralVaccineEntries,
  readCivEntries,
  readExternalParasiteEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
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
    case 'has-extra-rabies': {
      // 추가 접종(3차+) 은 (a) 직전 백신의 면역 유효기간 이내에 받아 chain 유지하고,
      // (b) 입국일이 입력된 경우 최신 booster 유효기간이 입국일을 커버해야 완료.
      // 둘 중 하나라도 못 만족하면 추가 접종이 더 필요한 상태 → 미완료.
      const r = readRabiesEntries(caseRow)
      if (r.length < 3) return false
      const latest = r[r.length - 1]
      const previous = r[r.length - 2]
      const previousValidUntil = resolveValidUntil(previous.date, previous.valid_until)
      if (!previousValidUntil || latest.date > previousValidUntil) return false
      // 입국일 = data.entry_date 우선, 없으면 케이스의 출국일(departure_date) 폴백.
      // 일본 등 entry_date 미사용 destination 에서도 검증 동작.
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry) {
        const latestValidUntil = resolveValidUntil(latest.date, latest.valid_until)
        if (!latestValidUntil || latestValidUntil < entry) return false
      }
      return true
    }
    case 'has-titer-entry':
      return readTiterEntries(caseRow).length > 0
    case 'has-extra-titer': {
      // 추가 항체검사(2회+) 는 (a) 2개 이상 입력되고, (b) 입국일이 입력된 경우 어떤 titer
      // 의 2년 유효기간이 입국일을 커버해야 완료. 못 커버하면 추가 검사가 더 필요한 상태.
      const t = readTiterEntries(caseRow)
      if (t.length < 2) return false
      // 입국일 = entry_date 우선, 없으면 출국일 폴백 (일본 등).
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry) {
        const hasValid = t.some((titer) => {
          const v = addYears(titer.date, 2)
          return !!v && v >= entry
        })
        if (!hasValid) return false
      }
      return true
    }
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
    case 'has-vet-visit': {
      // 검진일이 입력되어도 미래 날짜면 미완료 — '예정' 상태로 노출되어야 함.
      const dt = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (dt.length < 10) return false
      return dt < todayIso()
    }
    case 'has-flight-date': {
      // entry_date(도착일) 또는 케이스의 departure_date(출국일) 둘 중 하나라도 입력되면 완료.
      // 일본은 entry_date 미사용 → departure_date(= 항공권 출발일과 sync) 로 판정.
      const entryRaw = typeof data.entry_date === 'string' ? data.entry_date : ''
      const depRaw = typeof caseRow.departure_date === 'string' ? caseRow.departure_date : ''
      const hasEntry = entryRaw.length >= 10 || depRaw.length >= 10
      if (!hasEntry) return false
      // 왕복 케이스는 귀국 항공편까지 입력되어야 항공권 구매 완료. 출국만 입력된 상태로
      // 다음 step(사전 신고)으로 흘려보내면 보호자가 귀국편을 잊을 위험 — situational
      // 안내문이 카드에 노출되며 다음 할 일에 머무름.
      const ctx = buildCaseJourneyContext(caseRow)
      if (ctx.tripType === 'round') {
        return typeof data.return_date === 'string' && (data.return_date as string).length >= 10
      }
      return true
    }
    case 'has-advance-notification': {
      // 신청일 입력은 신고 접수 시그널일 뿐 — NACCS 허가증(Approval) 첨부까지 받아야
      // 완전 완료. 보호자가 첨부 없이 진행하려는 경우엔
      // case.data.advance_notification_approval_skipped 플래그로 명시적 skip.
      const hasDate =
        typeof data.advance_notification_date === 'string' &&
        (data.advance_notification_date as string).length >= 10
      if (!hasDate) return false
      if (data.advance_notification_approval_skipped === true) return true
      const docs = Array.isArray(data.documents) ? data.documents : []
      return docs.some(
        (d) =>
          !!d &&
          typeof d === 'object' &&
          (d as Record<string, unknown>).stepId === 'advance-notification',
      )
    }
    case 'has-jp-export-quarantine': {
      // 두 가지 완료 경로:
      //  - skipped=true (신청일 있으면) — 보호자가 예약 정보 없이 진행 처리 (portal '다음')
      //  - confirmed=true AND date AND time — 예약 확정. confirmed 플래그는 portal 보호자가
      //    date+time 입력 시 자동 set. admin 추가정보의 date/time 단독 입력은 '고객 희망'
      //    의미라 confirmed 안 켜짐 — admin 은 별도 UI 없음.
      const hasApplied =
        typeof data.jp_export_quarantine_application_date === 'string' &&
        (data.jp_export_quarantine_application_date as string).length >= 10
      if (data.jp_export_quarantine_reservation_skipped === true && hasApplied) return true
      if (data.jp_export_quarantine_confirmed !== true) return false
      const hasDate =
        typeof data.jp_export_quarantine_date === 'string' &&
        (data.jp_export_quarantine_date as string).length >= 10
      if (!hasDate) return false
      const time = typeof data.jp_export_quarantine_time === 'string' ? data.jp_export_quarantine_time : ''
      return /^\d{1,2}:\d{2}$/.test(time)
    }
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
      // 항공권 구매 step 의 '완료 시점' = 정보 입력 날짜(flight_info_recorded_at).
      // 항공편 자체 날짜(entry_date)는 일본 수입검역 step 의 표시일로 분리됐다.
      // legacy(기록 timestamp 없음): updated_at → entry_date 순으로 폴백.
      const rec =
        typeof data.flight_info_recorded_at === 'string' ? data.flight_info_recorded_at : null
      if (rec && rec.length >= 10) return rec.slice(0, 10)
      if (caseRow.updated_at && caseRow.updated_at.length >= 10) {
        return caseRow.updated_at.slice(0, 10)
      }
      const dt = typeof data.entry_date === 'string' ? data.entry_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-advance-notification': {
      const dt =
        typeof data.advance_notification_date === 'string' ? data.advance_notification_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-jp-export-quarantine': {
      // '신청' step 의 완료일 = 신청·예약 확정 행위 시점(= 신청일). 예약일(jp_export_quarantine_date)은
      // 미래 방문일이라 visit step(jp-export-quarantine-visit)의 표시일로 분리. 신청일 없는
      // 비정상 케이스만 예약일 폴백.
      const applied =
        typeof data.jp_export_quarantine_application_date === 'string'
          ? data.jp_export_quarantine_application_date
          : null
      if (applied && applied.length >= 10) return applied.slice(0, 10)
      const reserved =
        typeof data.jp_export_quarantine_date === 'string' ? data.jp_export_quarantine_date : null
      return reserved && reserved.length >= 10 ? reserved.slice(0, 10) : null
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
