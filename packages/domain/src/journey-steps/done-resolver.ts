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
  todayKst,
} from '../procedure-checks/utils'
import type { StepDoneSignal } from './types'
import { buildCaseJourneyContext } from './applicability'
import { findRabiesChainBreak } from './rabies-chain'
import {
  deriveAdvanceNotificationStatus,
  deriveJpExportQuarantineStatus,
} from './report-status'
import { areAllRequiredDocsVerified, resolveRequiredDocs } from '../required-docs'

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
      if (typeof implant !== 'string' || implant.length < 10) return false
      // 시술일이 미래(예정)면 아직 삽입 전 — 날짜가 도래해야 완료(출국 전 임상검사·검역과 동일).
      // 날짜 값 자체는 후속 검증(after-microchip 등)에 그대로 쓰이므로 보존하고, 완료 판정만 미룬다.
      return implant.slice(0, 10) <= todayKst()
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
      // 미래 접종일은 '예정' — 도래해야 완료로 잡힘.
      if (latest.date > todayKst()) return false
      // chain 정합성 — 순서 위반(직전 차수보다 이른 날짜)이나 유효기간 만료 후 접종이면 미완료.
      if (findRabiesChainBreak(r)) return false
      // 최신 추가 접종의 면역 유효기간이 이미 지났으면(만료) 또 접종해야 하므로 미완료.
      const latestValidUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!latestValidUntil || latestValidUntil < todayKst()) return false
      // 입국일이 입력된 경우, 그 유효기간이 입국일까지 커버해야 함. (entry_date 우선,
      // 없으면 케이스 출국일 폴백 — 일본 등 entry_date 미사용 destination 도 동작.)
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry && latestValidUntil < entry) return false
      return true
    }
    case 'has-titer-entry': {
      // 검사 → 결과 2단계 (사전 신고·일본 수출검역 신청과 동일 모델).
      //  - 채혈일(primary record[0])만 있으면 in_progress (검사 진행 중, done 아님).
      //  - 결과값(value) 입력 OR 보호자 '완료' 플래그(rabies_titer_result_confirmed) 면 done.
      // 180일 앵커(flight-purchase)·procedure-check 는 readTiterEntries(채혈일)를 직접 봐서
      // 무관 — 채혈일이 곧 1회차 검사일이라는 의미는 그대로다.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const arr = Array.isArray(data.rabies_titer_records)
        ? (data.rabies_titer_records as Array<Record<string, unknown>>)
        : []
      const primary = arr[0]
      const hasDate =
        !!primary && typeof primary.date === 'string' && (primary.date as string).length >= 10
      if (!hasDate) return false
      if (data.rabies_titer_result_confirmed === true) return true
      return typeof primary.value === 'string' && (primary.value as string).trim().length > 0
    }
    case 'has-extra-titer': {
      // 추가 항체 검사(2회+) 는 (a) 2개 이상 입력되고, (b) 가장 최근 채혈일이 도래했고,
      // (c) 입국일이 입력된 경우 어떤 titer 의 2년 유효기간이 입국일을 커버해야 완료.
      // 못 만족하면 추가 검사가 더 필요한 상태.
      const t = readTiterEntries(caseRow)
      if (t.length < 2) return false
      // 미래 채혈일은 '예정' — 도래해야 완료로 잡힘. (추가 백신 has-extra-rabies 와 동일 게이트.)
      // readTiterEntries 는 입력 순서라 위치로 최신을 못 잡음 — 최대 날짜로 판정.
      const latestTiterDate = t.reduce((max, e) => (e.date > max ? e.date : max), '')
      if (latestTiterDate > todayKst()) return false
      // 입국일 = entry_date 우선, 없으면 출국일 폴백 (일본 등).
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry) {
        const hasValid = t.some((titer) => {
          if (titer.date > entry) return false // 입국 후 채혈은 그 입국을 보증 못 함
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
      // 검진일 ≤ 오늘 AND 다음 중 하나:
      //  - legacy `vet_visit_confirmed=true` (옛 '저장=완료' 모델 또는 admin 토글)
      //  - 큐레이션된 필수 서류가 모두 ✓ (Japan 등 spec 있는 destination — 보호자가
      //    서류 탭에서 체크리스트를 채우면 자동 완료)
      //  - 큐레이션 spec 자체가 없는 destination — 자동 검증 신호가 없으므로 검진일 입력
      //    만으로 완료 처리 (옛 모델과 동일)
      const dt = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (dt.length < 10 || dt > todayKst()) return false
      if (data.vet_visit_confirmed === true) return true
      // 출국 전 임상검사 시점까지 발급되는 서류만 게이트 — 한국 수출 동물검역증(이후 발급)은 제외.
      if (areAllRequiredDocsVerified(caseRow, 'vet-visit')) return true
      return resolveRequiredDocs(caseRow.destination, caseRow) === null
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
    case 'has-advance-notification':
      // 신고 진행 상태는 [[deriveAdvanceNotificationStatus]] 가 단일 출처 — admin 신고 탭과
      // portal 사전 신고 step 이 같이 사용. 'done' = 첨부·skipped·legacy stored 'done'.
      return deriveAdvanceNotificationStatus(caseRow) === 'done'
    case 'has-jp-export-quarantine':
      // 일본 수출검역 신청도 동일 — [[deriveJpExportQuarantineStatus]] 가 단일 출처.
      // 'done' = skipped·confirmed+예약확정·legacy stored 'done'.
      return deriveJpExportQuarantineStatus(caseRow) === 'done'
    case 'has-kr-export-quarantine':
      // 검역소 방문해 '받은 날짜' — has-vet-visit 와 동일하게 검역일 + 보호자 확인으로 완료.
      return isQuarantineConfirmed(data, 'kr_export_quarantine_date', 'kr_export_quarantine_confirmed')
    case 'has-jp-import-quarantine':
      return isQuarantineConfirmed(data, 'jp_import_quarantine_date', 'jp_import_quarantine_confirmed')
    case 'has-jp-export-quarantine-visit':
      return isQuarantineConfirmed(data, 'jp_export_quarantine_visit_date', 'jp_export_quarantine_visit_confirmed')
    case 'has-kr-import-quarantine':
      return isQuarantineConfirmed(data, 'kr_import_quarantine_date', 'kr_import_quarantine_confirmed')
    case 'has-arrived': {
      // 도착 완료 — 왕복은 한국 수입검역, 편도는 일본 수입검역(있으면) 확인 / 출국일 경과.
      // 검역 step 과 동일하게 보호자 '저장' 확인 플래그로 완료. 비-일본 편도는 출국일 경과로 자동.
      const ctx = buildCaseJourneyContext(caseRow)
      // 또는 보호자가 완료 확인 prompt '잘 다녀왔어요' 로 직접 확인 — 목적지별 map.
      // (검역 미체크하고 다녀온 경우 보완. 완료 카드를 띄우는 용도 — 여정을 제거하지 않는다.)
      const ac = data.arrival_confirmed
      if (
        ctx.destinationToken &&
        ac != null &&
        typeof ac === 'object' &&
        (ac as Record<string, unknown>)[ctx.destinationToken] === true
      ) {
        return true
      }
      if (ctx.tripType === 'round') {
        return isQuarantineConfirmed(data, 'kr_import_quarantine_date', 'kr_import_quarantine_confirmed')
      }
      if (isQuarantineConfirmed(data, 'jp_import_quarantine_date', 'jp_import_quarantine_confirmed')) {
        return true
      }
      return !!caseRow.departure_date && caseRow.departure_date < todayKst()
    }
    case 'departure-past': {
      const dep = caseRow.departure_date
      if (!dep) return false
      return dep < todayKst()
    }
    default:
      return false
  }
}

/**
 * 검역·검사 step 완료 판정 — 검진일(dateKey)이 입력돼 있고 + 보호자가 '저장'으로
 * 확인(confirmKey === true)했을 때만 완료. 날짜만으론 자동 완료하지 않는다 — 예정일이
 * 지나도 보호자 확인 전까진 미완료('확인 대기'). 확인 플래그는 portal 저장 시 검진일이
 * 오늘 이하일 때 set, 미래·빈값이면 clear 된다.
 */
function isQuarantineConfirmed(
  data: Record<string, unknown>,
  dateKey: string,
  confirmKey: string,
): boolean {
  const dt = data[dateKey]
  if (typeof dt !== 'string' || dt.length < 10) return false
  return data[confirmKey] === true
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
      // 1차 = 입력 순서 첫 번째 (rabies_dates[0], 상세 폼의 '1차 칸'과 동일 정의)
      const r = readRabiesEntries(caseRow)
      return r.length > 0 ? r[0].date : null
    }
    case 'has-rabies-booster': {
      // 2차 = 입력 순서 두 번째 (rabies_dates[1])
      const r = readRabiesEntries(caseRow)
      return r.length >= 2 ? r[1].date : null
    }
    case 'has-extra-rabies': {
      // 추가 접종(3차+) = 입력 순서 마지막 (가장 최근에 추가한 항목)
      const r = readRabiesEntries(caseRow)
      return r.length >= 3 ? r[r.length - 1].date : null
    }
    case 'has-titer-entry': {
      // 1회차 = 가장 이른 항체 검사일 (180일 대기·2년 입국 기한의 기준일).
      // 광견병 백신(has-rabies-entry)이 r[0]=1차 인 것과 동일 컨벤션.
      const dates = readTiterEntries(caseRow)
        .map((e) => e.date)
        .filter((d): d is string => typeof d === 'string' && d.length >= 10)
      if (dates.length === 0) return null
      return dates.slice().sort()[0]
    }
    case 'has-extra-titer': {
      // 추가 항체 검사(2회+) = 가장 최근 검사일.
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
