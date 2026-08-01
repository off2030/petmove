import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  validateImportQuarantineDate,
  validateUsDogEntryDate,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  findRabiesValidityBreaks,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
} from './utils'
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 미국 (CDC·USDA APHIS) 절차 검증.
 *
 * 이 파일의 기본 경로는 한국처럼 CDC가 지정한 광견병 저위험국에 최근 6개월 계속 체류한
 * 개인 반려동물이다. 고위험국 체류 이력이 있으면 서류·예약·입국공항 요건이 달라지므로
 * 이 기본 여정에 억지로 끼우지 않고 blocker 로 전문 확인을 요청한다.
 *
 * 1차 출처:
 * - CDC 저위험국 개 입국: 생후 6개월, ISO 마이크로칩, CDC Dog Import Form
 *   https://www.cdc.gov/importation/dogs/rabies-free-low-risk-countries.html
 * - CDC 고위험국 목록:
 *   https://www.cdc.gov/importation/dogs/high-risk-countries.html
 * - CDC Dog Import Form:
 *   https://www.cdc.gov/importation/dogs/dog-import-form-instructions.html
 * - USDA 주별 규정:
 *   https://direct.aphis.usda.gov/live-animal-import/state-regulations
 * - 미국 → 한국 수출:
 *   https://direct.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-korea
 */

const COUNTRY = 'usa'

function readData(caseRow: Parameters<NonNullable<ProcedureCheck['run']>>[0]['caseRow'], destination?: string | null) {
  return buildDateRuleContext(caseRow, destination).data
}

function isDog(data: Record<string, unknown>): boolean {
  return data.species === 'dog'
}

// 광견병 룰 3종(3개월 최소연령·체인 유효·출국일 유효)은 **캐나다(ca.ts)와 동일**하게
// 운용한다(2026-07-26 사용자 지정) — 문구·판정·severity 전부 ca.* 와 같다.
export const US_CHECKS: ProcedureCheck[] = [
  {
    id: 'us.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '광견병 백신은 생후 3개월(달력 기준) 이후 접종 — 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. ca.rabies-prime-after-3months-old 와 동일.',
    severity: 'warning',
    addedAt: '2026-07-26',
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
    id: 'us.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. ca.rabies-booster-within-prime-validity 와 동일.',
    severity: 'warning',
    addedAt: '2026-07-25',
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
    id: 'us.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함. ca.rabies-valid-on-departure 와 동일.',
    // warning 승격(2026-08-01) — "카드가 있으면 만료는 전부 주의"(common.ts 2026-07-30 확정 원칙).
    // 카드 미매핑 룰이라 배너 중복은 ADVISORY_DEFERRED_CHECKS(scenario.ts) 등록으로 막는다.
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B).
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
  // '입국 경로 확인'(us.high-risk-history-unsupported blocker·us.rabies-risk-history-unknown)
  // 검증은 카드와 함께 삭제(2026-07-26 사용자 결정) — 기본 여정은 한국 출발 저위험국 경로 전제.
  // 구 us.rabies-valid-on-return(귀국일 유효·90일 미만 면제 게이트)도 캐나다 통일로 삭제.
  {
    id: 'us.dog-entry-age-six-months',
    country: COUNTRY,
    category: '일정',
    title: '강아지는 미국 도착일에 생후 6개월 이상',
    description: 'CDC 저위험국 경로의 개는 미국 도착일에 생후 6개월 이상이어야 함.',
    severity: 'blocker',
    addedAt: '2026-07-25',
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      if (!isDog(ctx.data)) return SKIP
      // 출국일 기준(2026-07-26) — 항공권 카드에서 도착일 입력을 없애 단순형이 됐다.
      // 저장 거부(validateEntryDateForDestination)와 같은 판정 함수·같은 기준일을 쓴다.
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const error = validateUsDogEntryDate(dep, ctx)
      if (!error) return { ok: true, message: `출국일(${dep}) 기준 생후 6개월 이상.` }
      return {
        ok: false,
        message: error,
        offendingPaths: ['birth_date', 'departure_date'],
      }
    },
  },
  // '도착 주 규정 확인'(us.state-requirements-confirmed) 검증도 카드와 함께 삭제(2026-07-26).
  // CDC 신고(us-cdc-dog-import-form) 관련 검증은 전부 삭제(2026-07-26 사용자 결정) —
  // us.cdc-form-required(미입력 주의)·us.cdc-form-date-valid(날짜 정합·6개월 유효)·
  // validateUsCdcFormDate(입력 차단)·알림 D-7·D-1 모두. 카드(안내·제출일 기록)만 남긴다.
  {
    id: 'us.import-inspection-date-valid',
    country: COUNTRY,
    category: '입국 검사',
    title: '미국 입국 검사일',
    description: '미국 입국 검사일은 미국 도착일 이후여야 함. 도착일 대신 출국일을 기준으로 본다.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const date =
        typeof ctx.data.us_import_quarantine_date === 'string'
          ? ctx.data.us_import_quarantine_date.slice(0, 10)
          : ''
      if (!date) return SKIP
      // ⚠️ 공용 validateImportQuarantineDate 를 쓰지 않는다 — 그 함수는 entry_date 만 보는데
      //   미국은 2026-07-26부터 항공권 카드에서 **도착일을 입력받지 않는다**(단순형 통일).
      //   그대로 두면 도착일이 비어 룰이 항상 SKIP 되어 검증이 죽는다(같은 날 발견한 회귀).
      //   하와이(hi.import-quarantine-date-valid)와 같은 컨벤션으로 출국일을 도착일 proxy 로
      //   쓴다 — 한국→미국은 날짜변경선 동쪽이라 출국일 = 도착일(같은 날)이 대부분이다.
      const dep = readDepartureDate(caseRow, destination)
      if (dep && date < dep) {
        return {
          ok: false,
          message: '미국 입국 검사일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['us_import_quarantine_date', 'departure_date'],
        }
      }
      return { ok: true, message: `미국 입국 검사일(${date})이 입국 이후.` }
    },
  },
  // us.dog-arrival-hygiene(구제역 위생 안내) 삭제 — 2026-07-26 사용자 결정.
  //   근거 자체는 있었다: USDA APHIS 는 구제역 발생국에서 오는 개의 털·발·침구를 깨끗이 하고
  //   도착 후 목욕·5일간 가축 접촉 제한을 안내하며, 한국은 APHIS 구제역 발생국 목록에 있다
  //   (2023 청주·증평, 2025-03 전남 발생으로 청정국 지위 정지).
  //   그런데 ①공항 입국 심사 카드에 '집에 가서 할 일'이 붙어 주제가 어긋났고 ②'구제역 때문'
  //   이라는 이유가 빠져 뜬금없이 읽혔으며 ③대부분의 보호자는 가축을 접할 일이 없어 노이즈였다.
  //   되살리려면 카드 위치(도착 카드가 아닌 곳)와 이유를 밝힌 문구부터 정할 것.
]
