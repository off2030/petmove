import type { CaseRow } from '../types'
import {
  addDays,
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
import { buildCaseJourneyContext, isSingleDoseRabiesCase } from './applicability'
import { findRabiesChainBreak } from './rabies-chain'
import {
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
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

  // quarantine:<field> — 나라별 도착(수입)·출국(수출) 검역(일본 외). 검역일 입력(≤오늘) +
  // 보호자 '완료' 확인. confirmed 키는 <field>의 _date→_confirmed. 한 분기가 모든 나라 처리.
  if (typeof signal === 'string' && signal.startsWith('quarantine:')) {
    const field = signal.slice('quarantine:'.length)
    return isQuarantineConfirmed(data, field, field.replace(/_date$/, '_confirmed'))
  }

  switch (signal) {
    case 'always-done':
      return true
    case 'microchip-set': {
      // 칩 번호 + 시술일 모두 입력되어야 완료. 시술일은 광견병 1차 백신 'after-microchip'
      // 체크의 기준일이라 없으면 후속 단계 검증이 무력화됨.
      if (!caseRow.microchip || caseRow.microchip.length === 0) return false
      const implant = data.microchip_implant_date
      if (typeof implant !== 'string' || implant.length < 10) return false
      // 다른 카드와 동일 — 미래(예정)면 미완료, 도래 후 '완료' 확인해야 done(microchip_confirmed).
      // 날짜 값 자체는 후속 검증(after-microchip 등)에 그대로 쓰이므로 보존하고, 완료 판정만 미룬다.
      return isDatedConfirmed(data, implant.slice(0, 10), 'microchip_confirmed')
    }
    case 'has-rabies-entry': {
      // 1차 = 입력순서 첫 항목(r[0]). 도래+확인(예정→완료) 게이트.
      const r = readRabiesEntries(caseRow)
      return isDatedConfirmed(data, r[0]?.date ?? null, 'rabies_1_confirmed')
    }
    case 'has-rabies-valid': {
      // 1회 접종국 단일 카드 — 종합백신(has-general-vaccine)과 동일. "가장 최근에 '실제로 맞은'
      // 접종" 의 유효기간이 입국일을 커버해야 완료. 미래(예정) 회차는 아직 맞은 게 아니므로 완료
      // 판정에서 제외 — 미리 잡아둔 부스터가 멀쩡히 유효한 접종의 완료를 풀지 않게(종합백신 동일).
      // 미래 회차는 추가접종(has-extra-rabies) 단계 + '예정' 배지로 별도 노출된다.
      const r = readRabiesEntries(caseRow)
      if (r.length === 0) return false
      const today = todayKst()
      const administered = r.filter((e) => e.date <= today)
      if (administered.length === 0) return false // 전부 미래(예정) → 미완료
      const latest = [...administered].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      // 이미 만료(오늘 기준) — 출국일 입력 여부와 무관하게 추가 접종 필요 → 미완료.
      if (validUntil && validUntil < today) return false
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry && validUntil && validUntil < entry) return false
      // 여행 미예약(입국일 없음) + 유효기간 만료 30일 임박 — 추가 접종 준비를 알리려 미완료로
      // 둔다(광견병 카드 situational 임박 안내와 짝). 이미 예약된 여행이 유효기간 내면 정상
      // 완료라 !entry 일 때만 — 출발 직전 멀쩡한 백신에 오경보가 뜨지 않게. 일본은 advisoryOnly
      // '추가 백신' 카드가 같은 역할(단일 접종국은 그 카드가 없어 여기서 처리).
      if (!entry && validUntil && validUntil < addDays(today, 30)) return false
      // 미래 예약(부스터)이 따로 있으면 이미 맞은 유효 회차로 완료 인정(플래그는 가장 늦은=미래
      // 회차를 반영해 false 라 무시). 없으면 평소대로 confirm 플래그 존중 — 단일 회차가 도래했어도
      // '저장' 확인 전까진 미완료(재입력 요구 유지). 1회국 단일카드는 별도 키(rabies_single_confirmed)
      // — 다중 목적지(일본+태국)에서 2회국 1차(rabies_1_confirmed)를 clobber 하지 않도록 분리.
      if (r.some((e) => e.date > today)) return true
      return isDatedConfirmed(data, latest.date, 'rabies_single_confirmed')
    }
    case 'has-rabies-booster': {
      // 2차 = 입력순서 둘째(r[1]). 도래+확인 게이트.
      const r = readRabiesEntries(caseRow)
      if (r.length < 2) return false
      return isDatedConfirmed(data, r[1].date, 'rabies_2_confirmed')
    }
    case 'has-extra-rabies': {
      // 추가 접종(일본 3차+ / 1회 접종국 2차+)은 (a) 직전 백신의 면역 유효기간 이내에 받아
      // chain 유지하고, (b) 입국일이 입력된 경우 최신 booster 유효기간이 입국일을 커버해야
      // 완료. 둘 중 하나라도 못 만족하면 추가 접종이 더 필요한 상태 → 미완료.
      const minExtraCount = isSingleDoseRabiesCase(caseRow) ? 2 : 3
      const r = readRabiesEntries(caseRow)
      if (r.length < minExtraCount) return false
      // 예정(미래)으로 저장한 추가 접종은 도래 후 '저장' 클릭으로 확인해야 완료.
      // false = 아직 확인 전. undefined = 옛 데이터 → 아래 날짜 게이트로 폴백(회귀 방지).
      if (data.rabies_extra_confirmed === false) return false
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
      // 예정(미래)으로 저장한 추가 검사는 도래 후 '저장' 클릭으로 확인해야 완료.
      // false = 아직 확인 전. undefined = 옛 데이터 → 아래 날짜 게이트로 폴백(회귀 방지).
      if (data.titer_extra_confirmed === false) return false
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
    case 'has-general-vaccine': {
      // 광견병과 동일 — 최근 접종 유효기간이 입국일을 커버해야 완료. 입국 전 만료면 추가
      // 접종이 더 필요한 상태 → 미완료(종합백신 카드가 '다음 할 일'에 남아 추가 접종 안내).
      // 입국일 미입력이면 입력만으로 완료(기존 동작 유지).
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) return false
      const latest = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      // 이미 만료(오늘 기준) — 출국일 입력 여부와 무관하게 추가 접종 필요 → 미완료.
      if (validUntil && validUntil < todayKst()) return false
      const entry =
        (typeof data.entry_date === 'string' && data.entry_date) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date : '') ||
        ''
      if (entry && validUntil && validUntil < entry) return false
      // 여행 미예약(입국일 없음) + 유효기간 만료 30일 임박 — 추가 접종 준비 안내를 위해 미완료로
      // 둔다(종합백신 카드 situational 임박 안내와 짝, 광견병과 동일 모델). 예약된 여행이 유효기간
      // 내면 정상 완료 — 출발 직전 오경보 방지로 !entry 일 때만.
      if (!entry && validUntil && validUntil < addDays(todayKst(), 30)) return false
      return isDatedConfirmed(data, latest.date, 'general_vaccine_confirmed')
    }
    case 'has-civ-vaccine':
      return isLatestAdministeredConfirmed(data, readCivEntries(caseRow).map((e) => e.date), 'civ_confirmed')
    case 'has-infectious-disease-test':
      return isLatestAdministeredConfirmed(
        data,
        readInfectiousDiseaseEntries(caseRow).map((e) => e.date),
        'infectious_disease_confirmed',
      )
    case 'has-internal-parasite':
      return isDatedConfirmed(
        data,
        latestDateOf(readInternalParasiteEntries(caseRow).map((e) => e.date)),
        'internal_parasite_confirmed',
      )
    case 'has-external-parasite':
      return isDatedConfirmed(
        data,
        latestDateOf(readExternalParasiteEntries(caseRow).map((e) => e.date)),
        'external_parasite_confirmed',
      )
    case 'has-deworming-time':
      return typeof data.deworming_time === 'string' && (data.deworming_time as string).length > 0
    case 'has-vet-visit': {
      // 출국 전 임상검사 — 다른 백신·검사·구충과 동일한 dated-confirm 모델로 통일.
      // 검진일이 도래(≤오늘)했고 vet_visit_confirmed 가 명시적 false 가 아니면 완료.
      // 미래(예정)로 저장하면 confirmed=false → 미완료(예정 배지), 도래 후 '완료' 확인 또는
      // 오늘/과거 날짜로 저장하면 confirmed=true → 완료. 서류 준비 현황은 별도
      // 단계(document-checklist, done='all-required-docs')로 분리됐다.
      const dt = typeof data.vet_visit_date === 'string' ? data.vet_visit_date.slice(0, 10) : ''
      return isDatedConfirmed(data, dt || null, 'vet_visit_confirmed')
    }
    case 'all-required-docs': {
      // 서류 체크리스트 — 큐레이션된 필수 서류가 모두 ✓(보유 또는 해당없음)이면 완료.
      // 출국 전 임상검사~서류 체크리스트 시점까지 발급되는 서류만 게이트 — 한국 수출
      // 동물검역증(검역소 방문 때 발급)은 이후 단계라 제외(cutoff=document-checklist order).
      // 목적지 미상(서류 목록 자체가 없는 케이스)은 막지 않는다 — 트리비얼 완료.
      if (resolveRequiredDocs(caseRow.destination, caseRow) === null) return true
      return areAllRequiredDocsVerified(caseRow, 'document-checklist')
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
        // 보호자가 귀국 항공권 '미정'을 표시하면 출국편만으로 완료 인정 — 귀국편을 아직 안
        // 정한 케이스(많음)를 다음 단계로 흘려보낸다. trip_type 은 round 그대로라 귀국 검역
        // 단계는 유지된다(편도 전환과 다름). 귀국일이 실제 입력되면 플래그는 해제된다.
        if (data.return_undecided === '1') return true
        return typeof data.return_date === 'string' && (data.return_date as string).length >= 10
      }
      return true
    }
    case 'has-advance-notification':
      // 신고 진행 상태는 [[deriveAdvanceNotificationStatus]] 가 단일 출처 — admin 신고 탭과
      // portal 사전 신고 step 이 같이 사용. 'done' = 첨부·skipped·legacy stored 'done'.
      return deriveAdvanceNotificationStatus(caseRow) === 'done'
    case 'has-import-permit':
      // 수입 허가도 동일 — [[deriveImportPermitStatus]] 가 단일 출처.
      // 'done' = 첨부·허가번호·완료 처리(skip)·legacy manual-flag.
      return deriveImportPermitStatus(caseRow) === 'done'
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

/** 날짜 배열에서 가장 늦은 'YYYY-MM-DD' (없으면 null). */
function latestDateOf(dates: string[]): string | null {
  const valid = dates.filter((d) => typeof d === 'string' && d.length >= 10)
  if (valid.length === 0) return null
  return valid.slice().sort().slice(-1)[0]
}

/**
 * 백신·검사·구충 카드 완료 — 가장 늦은 입력일이 도래(≤오늘) AND 확인 플래그가 명시적 false 가
 * 아님. 추가접종(has-extra-rabies)과 동일한 3-state:
 *   - confirmKey === false → 미완료 (미래로 저장됐거나 도래 후 아직 '완료' 미클릭).
 *   - confirmKey === true / undefined → 날짜 게이트(latest ≤ 오늘)로 판정.
 * 옛 데이터(플래그 없음=undefined): 과거 입력이면 그대로 완료 유지(회귀 0), 미래 입력이면
 * 자동으로 미완료(예정)로 교정. → prod 마이그레이션 불필요.
 */
function isDatedConfirmed(
  data: Record<string, unknown>,
  latestDate: string | null,
  confirmKey: string,
): boolean {
  if (!latestDate || latestDate.length < 10) return false
  if (data[confirmKey] === false) return false
  return latestDate <= todayKst()
}

/**
 * "미래 예약 회차가 이미 맞은 유효 회차의 완료를 풀지 않는" dated-confirm.
 *   - 이미 맞은(≤오늘) 회차가 하나도 없으면 미완료(전부 미래 = 예정).
 *   - 미래(>오늘) 예약 회차가 따로 있으면 이미 맞은 회차로 완료 인정 — confirm 플래그는 가장
 *     늦은(=미래) 회차를 반영해 false 라 무시한다. 미리 잡아둔 부스터가 멀쩡한 접종의 완료를 풀지
 *     않게(종합백신·구충이 splitScheduledDoses 로 얻는 동작을, 미래를 배열에 그대로 두는 카드에서
 *     done 판정으로 달성).
 *   - 미래 예약이 없으면 평소 dated-confirm: 가장 늦은 회차 ≤오늘 AND 플래그 != false (도래해도
 *     '저장' 확인 전까진 미완료 — 재입력 요구 유지).
 */
function isLatestAdministeredConfirmed(
  data: Record<string, unknown>,
  dates: string[],
  confirmKey: string,
): boolean {
  const today = todayKst()
  const valid = dates.filter((d) => typeof d === 'string' && d.length >= 10)
  const administered = valid.filter((d) => d <= today)
  if (administered.length === 0) return false
  if (valid.some((d) => d > today)) return true
  return isDatedConfirmed(data, administered.slice().sort().slice(-1)[0], confirmKey)
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

  // quarantine:<field> — 나라별 도착·출국 검역. 표시일 = 그 나라 검역일 필드 값.
  if (typeof signal === 'string' && signal.startsWith('quarantine:')) {
    const field = signal.slice('quarantine:'.length)
    const dt = typeof data[field] === 'string' ? (data[field] as string) : null
    return dt && dt.length >= 10 ? dt.slice(0, 10) : null
  }

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
    case 'has-rabies-valid': {
      // 단일 카드 완료일 = 가장 최근 접종일 (종합백신과 동일).
      const r = readRabiesEntries(caseRow)
      if (r.length === 0) return null
      return [...r].map((e) => e.date).sort().slice(-1)[0]
    }
    case 'has-rabies-booster': {
      // 2차 = 입력 순서 두 번째 (rabies_dates[1])
      const r = readRabiesEntries(caseRow)
      return r.length >= 2 ? r[1].date : null
    }
    case 'has-extra-rabies': {
      // 추가 접종(일본 3차+ / 1회 접종국 2차+) = 입력 순서 마지막 (가장 최근에 추가한 항목)
      const minExtraCount = isSingleDoseRabiesCase(caseRow) ? 2 : 3
      const r = readRabiesEntries(caseRow)
      return r.length >= minExtraCount ? r[r.length - 1].date : null
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
    case 'all-required-docs': {
      // 서류 체크리스트 완료일 = 모든 필수 서류가 ✓ 된 시점(required_docs_completed_at).
      // 완료가 수기 플래그·첨부·step done 여러 경로에서 파생돼 단일 날짜 필드가 없으므로,
      // portal 의 서류 완료 액션이 '모두 ✓' 전환 순간에 박아둔 타임스탬프를 읽는다(by_dest
      // 스코프 — caseRow 는 활성 목적지로 flatten 된 view). 옛 완료 케이스는 값이 없어 null
      // (표시 '—') — 서류를 한 번 토글하면 그 시점으로 박힌다.
      const dt =
        typeof data.required_docs_completed_at === 'string'
          ? data.required_docs_completed_at
          : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-advance-notification': {
      const dt =
        typeof data.advance_notification_date === 'string' ? data.advance_notification_date : null
      return dt && dt.length >= 10 ? dt.slice(0, 10) : null
    }
    case 'has-import-permit': {
      // 수입 허가 step 의 표시일 = 신청일 (사전 신고와 동일 — 보호자 행위 시점).
      const dt =
        typeof data.import_permit_application_date === 'string'
          ? data.import_permit_application_date
          : null
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
