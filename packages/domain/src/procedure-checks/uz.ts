import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  exceedsValidityYears,
  findRabiesValidityBreaks,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import {
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 우즈베키스탄 (State Veterinary Committee — Davlat veterinariya qo'mitasi) 절차 검증.
 *
 * ⚠️ **베트남 룰 한 벌을 복제한 것이다** (2026-07-20 사용자 지정). 카드 구성·검증 구조가
 *   베트남과 동일해야 한다는 전제로 옮겼고, 사용자가 확인해 준 델타만 다르다:
 *     - 마이크로칩 **필수** → 베트남과 달리 `uz.microchip-before-rabies` 를 둔다
 *       (칩이 입국 요건이므로 접종과의 선후를 따진다. 광견병 카드의 칩 선행 문구도 이 룰
 *        선언에서 파생된다 — buildRabiesCard 의 requiresChipFirst)
 *     - 광견병 최소 일령 **달력 3개월** (캄보디아의 고정 91일과 다름)
 *     - 접종 후 입국 대기 30일
 *   3년 백신 불인정 같은 나머지 값은 베트남에서 복제된 상태다. 나라별 개별 검토에서 정정한다.
 *
 * 출처(구버전에서 이어받음 — 개별 검토 때 재확인 대상):
 *  - State Vet Service — https://gov.uz/en/vetgov
 *  - USDA APHIS Uzbekistan —
 *    https://www.aphis.usda.gov/live-animal-export/export-live-animals-uzbekistan
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: 베트남 골격을 따라 **한국 귀국용만**(titer.need = 'return-only') 으로 둔다.
 *    구버전 프로파일 주석은 '입국 필수(유효 1년)'였으나 근거가 확인되지 않았다 —
 *    개별 검토에서 입국 필수로 되돌릴지 판단한다.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'uzbekistan'

export const UZ_CHECKS: ProcedureCheck[] = [
  {
    id: 'uz.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. 우즈베키스탄은 칩이 입국 요건이라 접종과의 선후를 따진다(칩이 요건이 아닌 베트남·캄보디아엔 이 룰이 없다).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 첫 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'uz.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'USDA APHIS Uzbekistan: "over 3 months of age" — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. 일수(91일)로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
      return {
        ok: true,
        message: `1차 접종일(${first.date}) 생후 3개월(${calendarAgeThreshold(birth, 3)}) 이후.`,
      }
    },
  },
  {
    id: 'uz.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. (USDA APHIS: "between 30 days and 12 months prior to entering Uzbekistan")',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 기준은 **최근** 접종이고 유효 부스터는 면제. 구버전은 가장 이른 접종(rabies[0])을 봐서
      // 만료 후 재접종한 케이스를 통째로 놓쳤다(베트남에서 2026-07-20 수정한 것과 같은 버그).
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 우즈베키스탄에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'uz.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
  {
    id: 'uz.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. (우즈베키스탄 1차 명문 미확인 — 베트남에서 복제한 보수 적용값. 개별 검토 대상)',
    severity: 'blocker',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const offending: string[] = []
      for (const r of rabies) {
        if (exceedsValidityYears(r.date, r.valid_until)) {
          offending.push(`rabies_dates[${r.originalIndex}].valid_until`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: '광견병 백신은 면역 유효기간 1년짜리만 인정돼요. 3년 백신은 사용할 수 없어요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'uz.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 **표시 억제를 겸한다** — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
    // severity 를 올리려면 ADVISORY_DEFERRED_CHECKS(scenario.ts)에도 함께 등록할 것.
    severity: 'info',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
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
  // ── 도착 수입 검역 ──
  {
    id: 'uz.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '우즈베키스탄 수입 검역일',
    description: '우즈베키스탄 수입 검역일은 우즈베키스탄 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.uz_import_quarantine_date === 'string'
          ? data.uz_import_quarantine_date.slice(0, 10)
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
          message: '우즈베키스탄 수입 검역일은 우즈베키스탄 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['uz_import_quarantine_date'],
        }
      }
      return { ok: true, message: `우즈베키스탄 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
