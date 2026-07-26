import {
  buildDateRuleContext,
  validateImportQuarantineDate,
  validateUsDogEntryDate,
} from '../journey-steps/date-rules'
import { buildCaseJourneyContext } from '../journey-steps/applicability'
import type { ProcedureCheck } from './types'
import {
  findRabiesValidityBreaks,
  addDays,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

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

function requiresRabiesForReturn(data: Record<string, unknown>): boolean {
  const birth = typeof data.birth_date === 'string' ? data.birth_date.slice(0, 10) : ''
  const ret = typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
  if (!birth || !ret) return true
  const day90 = addDays(birth, 90)
  return !day90 || ret >= day90
}

export const US_CHECKS: ProcedureCheck[] = [
  {
    id: 'us.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '한국 귀국용 광견병 접종 체인은 직전 접종의 면역 유효기간 안에 이어져야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const ctx = buildCaseJourneyContext(caseRow, destination)
      const data = readData(caseRow, destination)
      if (ctx.tripType !== 'round' || !requiresRabiesForReturn(data)) return SKIP
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length === 0) {
        return { ok: true, message: '광견병 추가 접종이 직전 접종 유효기간 이내.' }
      }
      return {
        ok: false,
        message: '광견병 추가 접종은 직전 접종의 면역 유효기간 안에 해야 해요.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'us.rabies-valid-on-return',
    country: COUNTRY,
    category: '광견병',
    title: '한국 귀국일에 광견병 면역 유효',
    description: '미국에서 한국으로 귀국할 때 최근 광견병 접종의 면역 유효기간이 남아 있어야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = readData(caseRow, destination)
      if (
        buildCaseJourneyContext(caseRow, destination).tripType !== 'round' ||
        !requiresRabiesForReturn(data)
      ) {
        return SKIP
      }
      const ret = typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      const rabies = readRabiesEntries(caseRow)
      if (!ret || rabies.length === 0) return SKIP
      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil || validUntil >= ret) {
        return { ok: true, message: '최근 광견병 접종의 면역 유효기간이 한국 귀국일까지 유지.' }
      }
      return {
        ok: false,
        message: '한국 귀국일에 광견병 백신의 면역 유효기간이 남아 있어야 해요.',
        offendingPaths: ['return_date', `rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  // '입국 경로 확인'(us.high-risk-history-unsupported blocker·us.rabies-risk-history-unknown)
  // 검증은 카드와 함께 삭제(2026-07-26 사용자 결정) — 기본 여정은 한국 출발 저위험국 경로 전제.
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
      const entry =
        typeof ctx.data.entry_date === 'string'
          ? ctx.data.entry_date.slice(0, 10)
          : typeof ctx.data.departure_flight_date === 'string'
            ? ctx.data.departure_flight_date.slice(0, 10)
            : ''
      if (!entry) return SKIP
      const error = validateUsDogEntryDate(entry, ctx)
      if (!error) return { ok: true, message: '미국 도착일에 생후 6개월 이상.' }
      return {
        ok: false,
        message: error,
        offendingPaths: ['birth_date', 'entry_date'],
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
