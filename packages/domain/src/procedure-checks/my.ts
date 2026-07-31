import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgGeneralVaccineExpiredBefore, msgMicrochipBeforeGeneralVaccine, msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 말레이시아 절차 검증.
 *
 * 구조는 태국(th.ts) 골격 복제(2026-07-22)이고, **수치·절차는 펫무브 말레이시아 가이드와
 * DVS 원문 조사로 교체했다**(같은 날 사용자 지정 "펫무브 웹사이트 참고 / 조사결과 반영").
 *
 * 한국은 DVS 분류상 **non-scheduled country** 다(2025-12-11 DVS 공지 목록에 한국 없음).
 *
 * 확정한 것:
 *  - 도착 후 **7일 격리**: "detained in quarantine for compulsory period of **not less than
 *    seven (7) days**" (DVS R2 Non-Scheduled 규정) — 도착 검역 카드에 명시.
 *  - **수입허가는 한국에서 신청 불가**. 현지 에이전시가 계류장 예약(최소 14일 전) 후 신청하고
 *    MAQIS 가 발급한다(가이드). 태국식 이메일 신청·R.6·60일 유효는 전부 걷어냈다.
 *  - 임상검사·수출검역 **출국 전 7일 이내**(가이드) → 프로파일 vetVisitWindowDays: 7.
 *  - 항체검사는 입국 요건이 **아니다**(가이드: "필수가 아니지만 한국으로 돌아오는 경우는 필수").
 *
 * 확인 실패(값을 지어내지 않은 것):
 *  - **최소 연령 = 달력 3개월** — DVS Procedure PDF "above 3 months old"(2026-07-23 확정).
 *    반입 시 동물 나이 요건이나 1회 접종국이라 광견병 1차 카드가 게이트를 겸한다. 구 84일 교체.
 *  - **접종 후 대기 30일 = 확정**(2026-07-23) — DVS R2 Non-Scheduled 규정을 여러 독립 자료가
 *    일치 인용("inactivated … at least 30 days before departure"). 공식 PDF 스캔형이라 직독은 못 함.
 *  - 금지·제한 견종 — 구세대 조사엔 있었으나 사용자 지정("없어도 돼")으로 룰을 두지 않는다.
 */

const COUNTRY = 'malaysia'

export const MY_CHECKS: ProcedureCheck[] = [
  {
    id: 'my.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
  {
    id: 'my.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 접종일과 같거나 이전이어야 함. 입국 시 칩 번호와 서류 일치 검증. 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝 — 칩 시술일을 나중에 수정해 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date', `rabies_dates[${first.originalIndex}].date`],
      }
    },
  },
  {
    id: 'my.microchip-before-general-vaccine',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정 — 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝, 칩 시술일 수정 후 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const entries = readGeneralVaccineEntries(caseRow)
      if (!microchip || entries.length === 0) return SKIP

      const first = entries[0] // readGeneralVaccineEntries 는 날짜순 정렬 — [0] = 가장 이른 접종.
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 종합백신(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeGeneralVaccine(),
        offendingPaths: ['microchip_implant_date', `general_vaccine_dates[${first.originalIndex}].date`],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'my.rabies-prime-after-3months',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 3개월 이상',
    description:
      '광견병 1차 접종은 생후 최소 3개월(달력) 이후. DVS Procedure PDF "above 3 months old"(2026-07-23 확정). 달력 개월이라 일수 환산 대신 meetsCalendarAge 를 쓴다 — 낀 달에 89~92일로 흔들리지 않게.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (!meetsCalendarAge(birth, first.date, 3)) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 3개월(${calendarAgeThreshold(birth, 3)}) 이후.` }
    },
  },
  {
    id: 'my.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국(=도착) 30일 이전 완료',
    description:
      '가장 최근 광견병 접종이 도착일 기준 30일 이전 완료(유효 부스터는 면제). 불활화 백신, 출국 30일 전 — DVS R2 Non-Scheduled 규정을 여러 독립 자료가 일치 인용해 확정(2026-07-23). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const ok1 = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${ok1.date}) → 출국(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종은 출국 30일 전까지 해야 해요.',
        offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    id: 'my.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear` = 1주년 당일까지).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
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
    id: 'my.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
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

  // ── 수입 금지 견종 — **룰을 두지 않는다**(사용자 지정 2026-07-22 "없어도 돼").
  //   태국 복제로 핏불 계열 blocker 가 따라 들어왔는데 이 나라 가이드·규정에 근거가 없었다.
  //   되살리려면 근거부터 확보할 것 — blocker 는 저장을 막아 우회할 방법이 없다.

  // ── 수입 허가 ──
  // 2026-07-26 제거: 수입 허가를 현지 에이전트가 신청해 보호자가 신청일을 모른다.
  //   카드가 버튼 완료 모델로 바뀌면서(destination-overrides importPermit) 신청일
  //   입력 자체가 사라져, 신청일 기준이던 my.import-permit-not-after-departure 를 삭제했다.
  {
    id: 'my.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '말레이시아 수입 검역일',
    description: '말레이시아 수입 검역일은 말레이시아 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.my_import_quarantine_date === 'string'
          ? data.my_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '말레이시아 수입 검역일은 말레이시아 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['my_import_quarantine_date'],
        }
      }
      return { ok: true, message: `말레이시아 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
