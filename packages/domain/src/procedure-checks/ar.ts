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
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 아르헨티나 절차 검증.
 *
 * ⚠️ **베트남(vn.ts) 한 벌 복제 (2026-07-22)** — 룰 구조·수치(달력 3개월·30일 대기·1년 백신만)는
 *   아직 전부 베트남 것이다. 나라별 규정 확정 후 수정 예정(사용자 지정 — "베트남 복사 후 세부 수정").
 *   베트남 고유 법령 룰(금지 견종·동반 2마리 한도)은 복제하지 않았다(4국 복제 전례).
 *   수출 검역 카드·룰도 나라별 조사 후 별도(4국 복제 전례) — vn.export-quarantine-date-valid 미복제.
 *
 * 복제 전 구세대 파일(SENASA 조사값)은 git 이력 참고 — 되살릴 후보:
 *  - 출처: SENASA "Ingresos con perros y/o gatos" + "Requisitos por destino: Corea"
 *  - 광견병: 3개월(90일) 이상, 1차 후 21일 권장(보수 30일 적용), 유효기간 제조사 라벨(통상 1년 —
 *    **1년 제한 근거 없음**, 복제된 blocker 와 어긋날 수 있다)
 *  - 건강증명서(CVI): 발급일 전 10일 이내 검진, CVI 자체는 발급·합법화일로부터 60일 유효
 *  - 내·외부 구충: CVI 발급일 전 15일 이내 (SENASA 명시)
 *  - **수입허가 불요·격리 없음** (복제된 '미충족 시 14일 격리' 문구와 충돌 — 세부 수정 1순위)
 *  - RNATT: 입국 의무 아님(한국 귀국용 별도). 종합백신: 의무 아님. 칩: SENASA 명시 의무 부재
 */

const COUNTRY = 'argentina'

export const AR_CHECKS: ProcedureCheck[] = [
  {
    id: 'ar.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준 — 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. ⚠️ 베트남 복제값(SENASA 구세대 조사도 "edad mínima 3 meses"로 일치).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      // 일수(91일)로 환산하지 않는다 — 달력 3개월은 생월에 따라 89~92일이라, 고정 일수로
      // 보면 11·12·1·2월생이 규정대로 접종해도 위반으로 뜬다(베트남과 동일 판정).
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
    id: 'ar.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait — 프로파일 entryWaitDaysAfterVaccine 파생)를 쓴다. ⚠️ 베트남 복제값 — 아르헨티나 규정 확정 후 수정(구세대 조사: 21일 권장·보수 30일).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 판정은 도메인 함수 하나 — 저장 거부(항공권 카드)와 이 주의가 어긋나면 안 된다.
      // 기준은 **최근** 접종이고 유효 부스터는 면제.
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      // 접종일은 과거 사실이라 조치는 '입국일을 미루는 것'뿐 — 출국일을 입력하는 시점은
      // 저장 거부가 막고, 접종일을 넣는 이 경로는 안내만 한다. 날짜는 넣지 않는다(lint:checks).
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 아르헨티나에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'ar.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
        // 문구는 한 번만 — 끊긴 구간마다 날짜를 나열하면 고객 문구에 날짜가 샌다.
        // 어느 기록이 문제인지는 offendingPaths 가 그 입력칸을 짚는다.
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
    id: 'ar.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. ⚠️ 베트남 복제 blocker — 아르헨티나(SENASA) 근거 미확인. 구세대 조사는 "제조사 라벨(통상 1년)"로 제한 없음. 규정 확정 후 재검토.',
    severity: 'blocker',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; validUntil: string }> = []
      for (const r of rabies) {
        if (exceedsValidityYears(r.date, r.valid_until)) {
          violations.push({ entry: r, validUntil: resolveValidUntil(r.date, r.valid_until) })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push('광견병 백신은 면역 유효기간 1년짜리만 인정돼요. 3년 백신은 사용할 수 없어요.')
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'ar.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 이 'info' 는 **표시 억제를 겸한다.** 이 룰은 어느 카드에도 매핑되지 않아서, warning 이면
    // scenario.ts 의 case-level 배너로 올라가 광견병 카드 문구와 중복된다(베트남과 동일 구조).
    // → severity 를 올리려면 ADVISORY_DEFERRED_CHECKS(scenario.ts)에도 함께 등록할 것.
    severity: 'info',
    addedAt: '2026-07-22',
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
    id: 'ar.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '아르헨티나 수입 검역일',
    description: '아르헨티나 수입 검역일은 아르헨티나 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ar_import_quarantine_date === 'string'
          ? data.ar_import_quarantine_date.slice(0, 10)
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
          message: '아르헨티나 수입 검역일은 아르헨티나 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ar_import_quarantine_date'],
        }
      }
      return { ok: true, message: `아르헨티나 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
