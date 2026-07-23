import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
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
 * 구조는 베트남(vn.ts) 골격에서 복제했고(2026-07-22), **수치는 SENASA 원문 조사로 교체했다**
 *   (같은 날 사용자 지정 "조사결과 반영").
 *
 * 1차 출처: SENASA 「Ingresos con perros y/o gatos」 (확인 2026-07-22)
 *   https://www.argentina.gob.ar/senasa/informacion-al-viajero/ingresar-o-regresar-al-pais/ingresos-con-perros-yo-gatos
 *   근거 법령: Resolución GMC 17/15 외.
 *
 * 원문에서 확정한 것:
 *  - **접종 후 21일**(30일 아님): "Cuando se trate de animales vacunados por primera vez, la
 *    vacuna debe haber sido aplicada al menos 21 (veintiún) días previos al ingreso a la
 *    República Argentina." → 기준점은 **입국일**, **1차 접종에만** 적용(유효 부스터 면제).
 *  - **3년 백신 인정**: "…con inmunidad vigente según el plazo de validez otorgado por el
 *    laboratorio fabricante de la vacuna." → 1년 제한 blocker 는 근거가 없어 제거했다.
 *  - **격리·수입허가 없음** → 도착 카드에서 '미충족 시 14일 격리'(베트남 복제 잔재) 삭제.
 *  - 최소 접종 연령 규정 **없음** — 있는 것은 "3개월 미만이면 접종 면제" 조항뿐이다.
 *    지금의 달력 3개월 룰은 골격에서 온 **보수값**이라 규정보다 엄격하다(사용자 확인 대상).
 *
 * 함께 확인됐으나 아직 룰로 만들지 않은 것: 건강검진 = CVI 발급일 전 10일 이내 /
 *   내·외부 구충 = CVI 발급일 전 15일 이내 / CVI·여권 유효 60일 / 동반수하물은 사전신청 불요.
 *
 * ⚠️ 펫무브 www 가이드는 아직 '출국 30일 전'이라 적혀 있다 — 웹사이트 갱신 필요.
 */

const COUNTRY = 'argentina'

export const AR_CHECKS: ProcedureCheck[] = [
  {
    id: 'ar.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준 — 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. ⚠️ SENASA 원문에는 최소 접종 연령 규정이 **없다**(3개월 미만 면제 조항만 있다). 골격에서 온 보수값이라 규정보다 엄격하지만 **3개월 유지 확정**(2026-07-23 사용자) — 다시 묻지 말 것.',
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
    id: 'ar.rabies-min-21days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 입국일 21일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 21일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait — 프로파일 entryWaitDaysAfterVaccine 파생)를 쓴다. ✅ SENASA 원문 확인값(2026-07-22). 기준점은 입국일이고 1차 접종에만 적용된다.',
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
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 21일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      // 접종일은 과거 사실이라 조치는 '입국일을 미루는 것'뿐 — 출국일을 입력하는 시점은
      // 저장 거부가 막고, 접종일을 넣는 이 경로는 안내만 한다. 날짜는 넣지 않는다(lint:checks).
      return {
        ok: false,
        message: '광견병 접종 후 21일이 지나야 아르헨티나에 입국할 수 있어요. 입국일을 미뤄야 해요.',
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
