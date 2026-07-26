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
    // ⚠️ 'info' 는 **표시 억제를 겸한다** — 캐나다·베트남과 같은 구조.
    // severity 를 올리려면 ADVISORY_DEFERRED_CHECKS(scenario.ts)에도 함께 등록할 것.
    severity: 'info',
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
    description: '미국 입국 검사일은 미국 도착일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const date =
        typeof ctx.data.us_import_quarantine_date === 'string'
          ? ctx.data.us_import_quarantine_date.slice(0, 10)
          : ''
      if (!date) return SKIP
      const error = validateImportQuarantineDate(date, ctx)
      if (!error) return { ok: true, message: '미국 입국 검사일이 미국 도착일 이후.' }
      return {
        ok: false,
        message: error.replace('수입 검역일', '미국 입국 검사일'),
        offendingPaths: ['us_import_quarantine_date', 'entry_date'],
      }
    },
  },
  {
    id: 'us.dog-arrival-hygiene',
    country: COUNTRY,
    category: '도착 안내',
    title: '강아지 도착 후 위생 관리',
    description:
      'USDA APHIS는 구제역 비청정지역에서 온 개의 털·발·침구를 깨끗이 하고 도착 후 목욕과 가축 접촉 제한을 안내함.',
    severity: 'info',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = readData(caseRow, destination)
      if (!isDog(data)) return SKIP
      return {
        ok: false,
        message:
          '미국 도착 전 강아지의 털·발과 침구를 깨끗이 하고, 도착 후 가능한 한 빨리 목욕시킨 뒤 5일간 가축과 접촉하지 않게 하세요.',
      }
    },
  },
]
