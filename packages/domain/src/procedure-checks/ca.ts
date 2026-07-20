import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
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
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 캐나다 (CFIA — Canadian Food Inspection Agency / CBSA) 절차 검증.
 *
 * ⚠️ **베트남 룰 한 벌을 복제한 것이다** (2026-07-20 사용자 지정). 카드 구성·검증 구조가
 *   베트남과 동일해야 한다는 전제로 옮겼고, 사용자가 확인해 준 델타만 다르다:
 *     - 마이크로칩 **필수 아님** → 베트남처럼 `ca.microchip-before-rabies` 를 두지 않는다
 *     - 광견병 최소 일령 **달력 3개월**
 *     - 접종 후 입국 대기 **0일** → `ca.rabies-min-Ndays-before-departure` 룰이 **없다**
 *       (프로파일에도 rabies.entryWaitDaysAfterVaccine 를 선언하지 않아 항공권 카드의
 *        저장 거부·대기 문구가 함께 빠진다 — 다른 3국과 유일하게 다른 지점)
 *   3년 백신 불인정 같은 나머지 값은 베트남에서 복제된 상태다. CFIA 는 실제로 다년 백신을
 *   인정할 가능성이 높아 **개별 검토 1순위**다.
 *
 * 출처(구버전에서 이어받음 — 개별 검토 때 재확인 대상):
 *  - CFIA "Bringing animals to Canada" — https://inspection.canada.ca/en/importing-food-plants-animals/pets
 *  - CFIA Import Reference Document —
 *    https://inspection.canada.ca/en/animal-health/terrestrial-animals/imports/import-policies/general/reference-document
 *  - CBSA Travelling with animals — https://www.cbsa-asfc.gc.ca/services/fpa-apa/animals-animaux-eng.html
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: CFIA 입국 의무 아님 — 한국 귀국용만(titer.need = 'return-only')
 *  - 상업용 8개월 미만 강아지(고위험국) 금지: 동적 확인 필요
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'canada'

export const CA_CHECKS: ProcedureCheck[] = [
  {
    id: 'ca.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'CFIA: 3개월 이상 강아지·고양이는 광견병 백신 의무(3개월 미만 면제) — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
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
  // ⚠️ 접종 후 입국 대기 룰은 **없다** — 캐나다는 대기 0일(사용자 지정). 다른 3국(베트남·몽골·
  //   우즈베키스탄·캄보디아 30일)과 유일하게 다른 지점이라, "빠졌다"고 올리지 말 것.
  {
    id: 'ca.rabies-booster-within-prime-validity',
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
    id: 'ca.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. (⚠️ CFIA 근거 없음 — 베트남에서 복제한 값. 캐나다는 다년 백신을 인정할 가능성이 높아 개별 검토 1순위)',
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
    id: 'ca.rabies-valid-on-departure',
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
    id: 'ca.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '캐나다 수입 검역일',
    description: '캐나다 수입 검역일은 캐나다 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ca_import_quarantine_date === 'string'
          ? data.ca_import_quarantine_date.slice(0, 10)
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
          message: '캐나다 수입 검역일은 캐나다 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ca_import_quarantine_date'],
        }
      }
      return { ok: true, message: `캐나다 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
