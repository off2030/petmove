import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  classifyExportQuarantineDate,
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
 * 카자흐스탄 (농업부 수의통제감독위원회) 절차 검증.
 *
 * ✅ **카자흐스탄 독자 규정이 아니라 EAEU 통일 수의요건이 직접 적용된다** — 카자흐스탄은
 *   EAEU **정회원**이다(우즈베키스탄은 옵서버라 자국 규정을 쓰는 것과 대비된다).
 *   관세동맹위원회 결정 제317호(2010-06-18) 부속서 4 **제15장**(모피수·토끼·개·고양이).
 *   카자흐 법령DB 등재: https://adilet.zan.kz/rus/docs/H10T0000317
 *   러시아·벨라루스·키르기스·아르메니아와 조문이 동일하다.
 *
 * 제15장 원문 핵심:
 *   "Не позднее чем за **20 дней** до отправки животных вакцинируют, если они не были
 *    привиты в течение последних **12 месяцев**: — всех плотоядных — против бешенства …
 *    — собак — против чумы плотоядных, гепатита, вирусного энтерита, парво- и
 *      аденовирусных инфекций, лептоспироза; — кошек — против панлейкопении"
 *   → ⚠️ **종합백신에도 광견병과 똑같은 20일/12개월 규칙이 걸린다.** 다른 목적지엔 없는
 *     구조다(태국·필리핀은 종합백신 기한이 광견병과 별도).
 *     개 = 사실상 DHPPL, 고양이 = 범백 단독(허피스·칼리시는 조문에 없다).
 *   다년 백신 **인정** — "срок поддержания иммунитета вакциной против бешенства,
 *     составляющий более одного года, не истек"(또는 0.5 МЕ/мл 실험실 입증).
 *   재접종은 직전 접종 유효기간 내여야 한다("в период действия предшествующей вакцинации").
 *   개인동반 **2두 이하는 수입허가·격리 모두 면제**, 국제 반려동물 여권이 수의증명서를 갈음.
 *   항체검사는 입국 요건이 **아니다** — 0.5 IU/ml 는 다년 백신의 면역 지속 입증 대체수단.
 *
 * ⚠️ 마이크로칩 — EAEU 제15장에 의무 조항이 **없다**. 근거는 카자흐 국내 등록법
 *   (「Об ответственном обращении с животными」 2021-12-30, 2023-09-01 시행, 국가DB TANBA)과
 *   **한국 귀국 요건**이다. '카자흐스탄 입국 요건'으로 단정하는 문구를 쓰지 말 것.
 *
 * 확인 실패(추측으로 채우지 않은 것):
 *  - **광견병 최소 접종 연령 3개월** — 제15장에서 상반된 판독이 나왔다(3개월 미만 반입 금지인지
 *    허용인지). 사용자 확정값이라 유지하되 카자흐 1차 근거로는 인용 불가.
 *  - 출국 전 임상검사 기한 5일(구판) vs 14일(현행 추정) — adilet 원문 SSL 오류로 미확인.
 *  - 금지 견종·마리수 2두의 개/고양이 합산 여부.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'kazakhstan'

export const KZ_CHECKS: ProcedureCheck[] = [
  {
    id: 'kz.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. ⚠️ 근거는 EAEU 입국요건이 아니라 카자흐 동물등록법(2023-09-01 시행)과 한국 귀국 요건이다 — 제15장엔 칩 조항이 없다.',
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
    id: 'kz.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준(사용자 확정값). ⚠️ EAEU 제15장에서 연령 조항 판독이 엇갈려 카자흐 1차 근거로는 인용 불가 — 확인되면 근거를 채울 것. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
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
    id: 'kz.rabies-min-20days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 20일 이상 전',
    description:
      'EAEU 제15장 "Не позднее чем за 20 дней до отправки" — 최근 12개월 내 접종 이력이 있으면 재접종 면제. 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. 상업 사이트의 21일 설은 근거 불명이라 쓰지 않는다.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 20일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 20일이 지나야 카자흐스탄에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'kz.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      'EAEU 제15장 "любая последующая вакцинация против бешенства проводилась в период действия предшествующей вакцинации" — 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다.',
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
    id: 'kz.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 표시 억제를 겸한다 — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
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
  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'kz.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '카자흐스탄 수입 검역일',
    description: '카자흐스탄 수입 검역일은 카자흐스탄 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kz_import_quarantine_date === 'string'
          ? data.kz_import_quarantine_date.slice(0, 10)
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
          message: '카자흐스탄 수입 검역일은 카자흐스탄 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['kz_import_quarantine_date'],
        }
      }
      return { ok: true, message: `카자흐스탄 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'kz.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '카자흐스탄 수출 검역일',
    description:
      '카자흐스탄 수출 검역일은 카자흐스탄 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      const verdict = classifyExportQuarantineDate(data.kz_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '카자흐스탄 수출 검역일은 카자흐스탄 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['kz_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '카자흐스탄 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['kz_export_quarantine_date'],
        }
      }
      return { ok: true, message: `카자흐스탄 수출검역일 체류 기간 내.` }
    },
  },
]
