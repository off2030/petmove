import {
  buildDateRuleContext,
  validateImportQuarantineDate,
  validateUsCdcFormDate,
  validateUsDogEntryDate,
  validateUsExportHealthCertDate,
} from '../journey-steps/date-rules'
import { buildCaseJourneyContext } from '../journey-steps/applicability'
import type { ProcedureCheck } from './types'
import {
  findRabiesValidityBreaks,
  addDays,
  addMonths,
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
  {
    id: 'us.high-risk-history-unsupported',
    country: COUNTRY,
    category: '입국 경로',
    title: '최근 6개월 광견병 고위험국 체류 없음',
    description:
      'CDC 고위험국 체류 이력이 있으면 저위험국 기본 경로와 다른 서류·예약·입국공항 요건을 적용해야 함.',
    severity: 'blocker',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = readData(caseRow, destination)
      if (!isDog(data) || data.us_dog_rabies_risk_history !== 'high_risk') return SKIP
      return {
        ok: false,
        message:
          '최근 6개월 동안 광견병 고위험국 체류 이력이 있어요. 미국 입국 절차가 달라지므로 담당자에게 별도로 확인하세요.',
        offendingPaths: ['us_dog_rabies_risk_history'],
      }
    },
  },
  {
    id: 'us.rabies-risk-history-unknown',
    country: COUNTRY,
    category: '입국 경로',
    title: '최근 6개월 체류 국가 확인',
    description: 'CDC 저위험국 경로 적용 전에 최근 6개월 체류 국가를 확정해야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = readData(caseRow, destination)
      if (!isDog(data) || data.us_dog_rabies_risk_history !== 'unknown') return SKIP
      return {
        ok: false,
        message: '최근 6개월 동안 머문 국가를 확인한 뒤 미국 입국 경로를 선택하세요.',
        offendingPaths: ['us_dog_rabies_risk_history'],
      }
    },
  },
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
  {
    id: 'us.state-requirements-confirmed',
    country: COUNTRY,
    category: '입국 준비',
    title: '미국 도착 주 규정 확인',
    description: '미국 연방 규정과 별도로 도착 주와 항공사의 반입 조건을 확인해야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = readData(caseRow, destination)
      const state =
        typeof data.us_destination_state === 'string' ? data.us_destination_state.trim() : ''
      if (state && data.us_state_requirements_confirmed === 'yes') {
        return { ok: true, message: '도착 주와 주별 규정 확인 완료.' }
      }
      return {
        ok: false,
        message: '미국 도착 주를 입력하고 주별 반려동물 반입 규정을 확인하세요.',
        offendingPaths: ['us_destination_state', 'us_state_requirements_confirmed'],
      }
    },
  },
  // us.cdc-form-required(제출일 미입력 주의)는 2026-07-26 사용자 결정으로 삭제 —
  // 카드 미완료 상태와 중복이고, 항공권만 넣으면 여행 한참 전부터 노란 경고가 떠 있었다.
  // 제출 독려는 알림(D-7·D-1)이 담당하고, 여기는 날짜 정합성(us.cdc-form-date-valid)만 남긴다.
  {
    id: 'us.cdc-form-date-valid',
    // 하와이 — 미국의 주(州)라 CDC 연방 규칙이 그대로 적용(카드도 base 공유, 2026-07-26).
    country: ['usa', 'hawaii'],
    category: '신고',
    title: 'CDC Dog Import Form 제출일',
    description: 'CDC Dog Import Form 제출일은 미국 도착일보다 늦을 수 없음.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const filed =
        typeof ctx.data.us_cdc_form_date === 'string'
          ? ctx.data.us_cdc_form_date.slice(0, 10)
          : ''
      if (!filed) return SKIP
      const error = validateUsCdcFormDate(filed, ctx)
      if (error) {
        return {
          ok: false,
          message: error,
          offendingPaths: ['us_cdc_form_date', 'entry_date'],
        }
      }
      const entry =
        typeof ctx.data.entry_date === 'string'
          ? ctx.data.entry_date.slice(0, 10)
          : typeof ctx.data.departure_flight_date === 'string'
            ? ctx.data.departure_flight_date.slice(0, 10)
            : ''
      if (entry && addMonths(filed, 6) < entry) {
        return {
          ok: false,
          message:
            'CDC Dog Import Form 접수증은 발급 후 6개월 동안 유효해요. 미국 입국 전에 다시 제출하세요.',
          offendingPaths: ['us_cdc_form_date', 'entry_date'],
        }
      }
      return { ok: true, message: 'CDC Dog Import Form 제출일과 6개월 유효기간이 유효.' }
    },
  },
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
    id: 'us.export-health-cert-date-valid',
    country: COUNTRY,
    category: '귀국 서류',
    title: '미국 수출 건강증명서 발급·승인일',
    description:
      '미국 수출 건강증명서는 미국 체류 중, 미국 출국 전 30일 이내에 발급·승인되어야 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    allowDate: true,
    run: ({ caseRow, destination }) => {
      if (buildCaseJourneyContext(caseRow, destination).tripType !== 'round') return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const date =
        typeof ctx.data.us_export_quarantine_date === 'string'
          ? ctx.data.us_export_quarantine_date.slice(0, 10)
          : ''
      if (!date) return SKIP
      const error = validateUsExportHealthCertDate(date, ctx)
      if (!error) return { ok: true, message: '미국 수출 건강증명서 발급·승인일이 유효한 범위.' }
      return {
        ok: false,
        message: error,
        offendingPaths: ['us_export_quarantine_date', 'entry_date', 'return_date'],
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
