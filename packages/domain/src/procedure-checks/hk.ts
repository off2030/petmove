import {
  buildDateRuleContext,
  validateHkEntryDate,
  validateIeAdvanceNoticeDate,
  violatesHkGeneralVaccineDoseWindow,
  violatesHkRabiesDoseWindow,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  findRabiesValidityBreaks,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
} from './utils'
import {
  msgGeneralVaccineExpiredBefore,
  msgImportQuarantineBeforeEntry,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 홍콩 (AFCD — Agriculture, Fisheries & Conservation Department) 절차 검증.
 *
 * 출처:
 *  - AFCD Group II 페이지 — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/qua_ie_ipab_idc_Group_II.html
 *  - DC-02v05 Group II Permit Terms (Jun-2025) — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/files/DC_02v05_Terms_for_import_G2_Jun25B.pdf
 *  - VC-DC2 Health Certificate (Oct-2025) — https://www.afcd.gov.hk/english/quarantine/qua_ie/qua_ie_ipab/qua_ie_ipab_idc/files/VC_DC2_Oct_25E.pdf
 *  - 펫무브 홍콩 가이드 — apps/www/content/docs/hongkong-pet-travel-guide.json
 *
 * 한국 = Group II. 격리 면제, RNATT(항체검사) 면제.
 *
 * DC-02v05 원문 확인값(2026-07-26 PDF 직접 확인):
 *  - 1항  도착 24시간 전 Import & Export Section 당직자에게 통보(업무시간 내)
 *  - 2항  MANIFESTED CARGO 만 허용 — 초과수하물·기내 동반 불가
 *  - 5항  "Dogs and cats **less than 5 months old** or more than 4 weeks pregnant must NOT be imported."
 *  - 6항  금지 견종(핏불·재패니즈 토사·도고 아르헨티노·필라 브라질레이로 및 교잡)
 *  - 9항  마이크로칩 = ISO 또는 AVID 호환
 *  - 10항 5개월 이상 개는 **도착 시 홍콩 Dog Licence** 취득 필요
 *  - 11(a) 건강증명서 = 수출 14일 이내 발급 / 11(b) 거주증명 = 180일 연속 거주 + 반경 10km 광견병 미발생
 *  - 11(c) 광견병 = 출국 30일 이상 전 · 1년 이내, 1차 접종 시 **생후 90일 이상**
 *  - 11(d) 종합백신 = 출국 14일 이상 전 · 1년 이내
 *          · 개  = canine distemper, infectious canine hepatitis, canine parvovirus (D·H·P 뿐)
 *          · 고양이 = feline panleucopaenia + feline respiratory disease complex
 *  - 11(e) Airline Certificate (Captain's Affidavit, PC101)
 *
 * ⚠️ 세대 교체(2026-07-26): 이 파일은 펫무브워크 전용 시절(2026-05-07) 문법이라 severity 가
 *   전부 'info' 였고, 저장 거부와 판정을 공유하지 않아 계산이 갈릴 수 있었다. 필리핀·말레이시아
 *   세대에 맞춰 재작성 — **모든 룰이 date-rules 의 저장 거부 함수를 그대로 호출**한다.
 *   함께 메운 갭: 광견병 chain 단절, 5개월령, 수입허가 2종, 수입검역일, 사전 통지.
 *   ⛔ 광견병 1차 최소 연령을 '보수 91일 + 캘린더 3개월'로 되돌리지 말 것 — 규정은 90일이고,
 *      규정보다 엄한 기준은 갈 수 있는 사람을 막는다(이스라엘 2026-07-25 정리와 같은 판단).
 *
 * 시스템 검증 제외(데이터 없음 — 카드·서류 안내로만 다룸):
 *  - 180일 거주 요건·반경 10km 광견병 미발생 → 한국 거주 반려동물은 자동 충족, 앱에 입력칸 없음
 *  - 금지 견종·벵갈/사바나 고양이, Dog Licence, Airline Certificate(PC101)
 *
 * 컨벤션 (PH/MY/SG 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'hongkong'

/** 입국일 근사 — 홍콩은 항공권 카드가 단순형(출발일만)이라 입국일이 없으면 출국일을 쓴다. */
function readEntryOrDeparture(
  caseRow: Parameters<typeof readDepartureDate>[0],
  destination: string | null | undefined,
): string {
  const ctx = buildDateRuleContext(caseRow, destination)
  const entry =
    typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
      ? ctx.data.entry_date.slice(0, 10)
      : ''
  return entry || (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
}

export const HK_CHECKS: ProcedureCheck[] = [
  // ── 광견병 ──
  {
    id: 'hk.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
        return {
          ok: false,
          message: '광견병 백신은 직전 접종의 면역 유효기간 안에 다시 접종해야 해요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈가 직전 접종 유효기간 이내.' }
    },
  },

  // ── 마이크로칩 ──
  // 2026-07-26 제거: 홍콩 AFCD DC-02v05 규정에는 마이크로칩 삽입을 광견병 접종 이전에 해야 한다는
  // 조항이 없다. 9항은 칩의 규격만, 11(a)는 건강증명서의 칩 번호 일치만 요구한다.

  {
    id: 'hk.rabies-prime-after-90days',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 90일 이후',
    description:
      'AFCD DC-02v05 11(c): "In the case of primary vaccination the animal was at least 90 days old when it was vaccinated." 프로파일 rabies.minAgeDays(90)와 같은 값 — 카드 문구·earliest 잠금도 같은 곳에서 파생한다.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 90) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('90일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령 (≥90).` }
    },
  },
  {
    id: 'hk.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      'AFCD DC-02v05 11(c) / VC-DC2 (c): "vaccinated against rabies not less than 30 days … prior to export." 증명서는 접종일을 **한 칸**에 적는 구조라, 30일 대기를 채운 dose 가 하나라도 있으면 통과다(violatesHkRabiesDoseWindow — 저장 거부와 공용). 상한(1년)은 hk.rabies-valid-on-departure 담당. ⛔ 공용 violatesRabiesEntryWait 로 되돌리지 말 것 — 유효 부스터 면제 때문에 "부스터는 30일 미달 + 직전 접종은 1년 초과"인 케이스가 통과했다(2026-07-26).',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readEntryOrDeparture(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (violatesHkRabiesDoseWindow(data, dep)) {
        return {
          ok: false,
          message:
            '광견병 접종 후 30일이 지나야 홍콩에 입국할 수 있어요. 날짜를 확인하세요.',
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `입국(${dep}) 기준 30일 대기를 채운 접종이 있음.` }
    },
  },
  {
    id: 'hk.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      'AFCD DC-02v05 11(c): "not more than 1 year prior to export." 최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: msgRabiesExpiredBefore('출국'),
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 종합백신 ──
  {
    id: 'hk.general-vaccine-14days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신은 출국일 14일 이상 전 접종',
    description:
      'AFCD DC-02v05 11(d) / VC-DC2 (f): "not less than 14 days … before coming into Hong Kong." 광견병 11(c)와 같은 구조라 같은 판정(violatesHkGeneralVaccineDoseWindow)을 쓴다 — 14일 대기를 채운 접종이 하나라도 있으면 통과. 저장 거부(validateGeneralVaccineEntryWait 의 홍콩 분기)와 공용. 상한(1년)은 hk.general-vaccine-valid-on-departure 담당(프로파일 generalVaccineOneYearOnly 로 유효기간이 1년으로 고정돼 그 룰이 곧 규정의 상한이다).',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readEntryOrDeparture(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = entries[entries.length - 1]
      if (violatesHkGeneralVaccineDoseWindow(data, dep)) {
        return {
          ok: false,
          message:
            '종합백신 접종 후 14일이 지나야 홍콩에 입국할 수 있어요. 날짜를 확인하세요.',
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `입국(${dep}) 기준 14일 대기를 채운 종합백신이 있음.` }
    },
  },
  {
    id: 'hk.general-vaccine-valid-on-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '출국일에 종합백신 면역 유효',
    description:
      'AFCD DC-02v05 11(d) "not more than 1 year" — 최근 종합백신의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: msgGeneralVaccineExpiredBefore('출국'),
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'hk.min-5months-on-arrival',
    country: COUNTRY,
    category: '일정',
    title: '입국일 시점 생후 5개월 이상',
    description:
      'AFCD DC-02v05 5항: "Dogs and cats less than 5 months old … must NOT be imported." 저장 거부(validateHkEntryDate)와 같은 함수 — 출국일을 나중에 당겨 어긋난 경우를 주의로 표면화한다.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const dep = readEntryOrDeparture(caseRow, destination)
      if (!dep) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateHkEntryDate(dep, ctx)
      if (msg) {
        return {
          ok: false,
          message: '생후 5개월 이상의 강아지(혹은 고양이)만 데려갈 수 있어요.',
          offendingPaths: ['departure_date', 'birth_date'],
        }
      }
      return { ok: true, message: `입국일(${dep}) 시점 생후 5개월 이상.` }
    },
  },

  // ── 수입허가 (Special Permit) ──
  // 2026-07-26 제거: 홍콩 수입 허가는 펫무브가 대행하지 않아 현지 에이전트가 신청한다.
  //   보호자는 신청일을 모르므로 카드가 버튼 완료 모델로 바뀌었고(destination-overrides
  //   hongkong importPermit), 판정할 신청일 자체가 없어 두 룰(hk.import-permit-not-after-
  //   departure / hk.import-permit-within-6months)을 함께 삭제했다.

  // ── 사전 통지 (도착 24시간 전) ──
  {
    id: 'hk.advance-notice-24h-before-entry',
    country: COUNTRY,
    category: '사전통지',
    title: '사전 통지 마감 (도착 24시간 전)',
    description:
      'AFCD DC-02v05 1항: "must notify the Duty Officer of the Import & Export Section during office hours … at least 24 hours in advance of the anticipated time of arrival." 입력 차단과 같은 함수(validateIeAdvanceNoticeDate — 목적지 중립 24시간 판정) — 항공편 수정 후 어긋난 케이스를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.hk_advance_notice_date === 'string'
          ? data.hk_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const entry = readEntryOrDeparture(caseRow, destination)
      const msg = validateIeAdvanceNoticeDate(notice, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['hk_advance_notice_date', 'departure_date'] }
      }
      return {
        ok: true,
        message: entry ? `통지일(${notice}) 도착(${entry}) 1일 이전.` : `통지일(${notice}) 입력됨 (도착일 미입력).`,
      }
    },
  },

  // ── 검역 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 ──
  {
    id: 'hk.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '홍콩 수입 검역일',
    description: '홍콩 수입 검역일은 홍콩 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.hk_import_quarantine_date === 'string'
          ? data.hk_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      // 홍콩은 항공권 카드가 단순형(출발일만)이라 입국일이 비는 게 정상 — 출국일로 폴백한다
      // (ICN→HKG 는 당일 도착). 둘 다 없으면 판정하지 않는다.
      const entry = readEntryOrDeparture(caseRow, destination)
      if (entry && raw < entry) {
        return {
          ok: false,
          message: msgImportQuarantineBeforeEntry('홍콩'),
          offendingPaths: ['hk_import_quarantine_date'],
        }
      }
      return { ok: true, message: `홍콩 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
