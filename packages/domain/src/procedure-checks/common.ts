import { DESTINATION_OVERRIDES, isRabiesFreeOrigin } from '../destination-config'
import {
  buildDateRuleContext,
  validateKrExportDate,
  validateKrImportDate,
  validateVetVisitDate,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import { addYears, formatKoreanDate, readTiterEntries, readVetVisitDate, SKIP } from './utils'

/**
 * 목적지 무관 — 한국 출입국 측 공통 절차 검증.
 *
 * 출국 전 임상검사·한국 수출 검역·한국 수입 검역(왕복 귀국)은 어느 목적지든 한국발
 * 케이스가 거치는 한국 측 단계라 모든 목적지에 적용된다. 이는 메모리의 "공통룰 금지(country: 'all' 누수)"가 막는 *특정국
 * 룰 누수*가 아니라, 진짜로 전 목적지가 대상인 절차다. 그래서 'all' 같은 매직 토큰 대신
 * 실제 지원 목적지 키 전체를 명시 배열로 선언한다 — `findDestinationKey` 가 돌려줄 수 있는
 * destinationKey 집합과 정확히 일치하며(그 외 토큰은 destinationKey=null 이라 어차피 검사
 * 자체가 안 돈다), 새 국가가 추가돼도 누락 없이 자동 포함된다.
 */
const ALL_DESTINATION_KEYS: string[] = Object.keys(DESTINATION_OVERRIDES)

export const COMMON_CHECKS: ProcedureCheck[] = [
  // ── 검역·검사 일정 자기 검증 (전 목적지 공통) ──────────────────────────
  // 입력 시점 client 입력 차단(step-detail-view)과 같은 함수를 매 렌더 재실행 — 앞 단계
  // (항공편 등)를 수정해 이미 입력된 일정이 어긋났을 때 '주의'로 표면화한다. (jp.*-date-valid
  // 와 동일 패턴 — vet-visit / certificate-issue 는 base catalog 의 공통 step 이라 여기 둔다.)
  {
    id: 'common.vet-visit-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검사',
    title: '출국 전 임상검사일',
    description: '출국 전 임상검사일은 출국일 이전·목적지별 검진 가능 윈도우 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-06-11',
    run: ({ caseRow, destination }) => {
      // 활성 목적지 기준 내원일(scoped 우선) — buildDateRuleContext 와 동일 출처.
      const raw = (readVetVisitDate(caseRow, destination) ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateVetVisitDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['vet_visit_date'] }
      }
      return { ok: true, message: `임상검사일(${raw}) 출국 전 윈도우 내.` }
    },
  },
  {
    id: 'common.kr-export-quarantine-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검역',
    title: '한국 수출 검역일',
    description:
      '한국 수출 검역일은 출국 전 임상검사 이후·출국일 이전이며 출국일 기준 윈도우 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-06-11',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_export_quarantine_date === 'string'
          ? data.kr_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrExportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_export_quarantine_date'] }
      }
      return { ok: true, message: `한국 수출검역일(${raw}) 출국 전 윈도우 내.` }
    },
  },
  // 한국 수입 검역(왕복 마지막) — 귀국 후 한국 공항 검역. 검역일 ≥ 귀국일.
  // 전 목적지 왕복 공통이라 국가별(jp/th/ph/eu) 분리 대신 common 1개로 통합(kr-export 와 동일).
  {
    id: 'common.kr-import-quarantine-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검역',
    title: '한국 수입 검역일',
    description: '한국 수입 검역일은 한국 귀국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-17',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_import_quarantine_date === 'string'
          ? data.kr_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrImportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_import_quarantine_date'] }
      }
      return { ok: true, message: `한국 수입검역일(${raw}) 귀국 이후.` }
    },
  },
  // 한국 귀국 광견병 항체검사 유효기간(2년) — 왕복 귀국 시 한국은 채혈일 2년 이내 검사만
  // 인정(채혈 + 2년 ≥ 귀국일). EU 처럼 입국용 항체는 부스터 chain 유지 시 무기한이라도,
  // 귀국엔 2년 룰이 별도로 걸린다. 단 광견병 비발생 지역(일본·호주·영국 등)산은 한국이
  // 항체검사 자체를 면제 → isRabiesFreeOrigin 이면 SKIP. 편도(귀국일 없음)도 SKIP.
  // 비발생 지정은 수시 변동(APQA 정적 미공표)이라 입력불가·강한 주의가 아닌 info(안내) +
  // 검역본부 확인 권고로 둔다. (isRabiesFreeOrigin 주석의 변동성·면책 참고.)
  {
    id: 'common.kr-return-titer-within-2years',
    country: ALL_DESTINATION_KEYS,
    category: '광견병',
    title: '한국 귀국 광견병 항체 검사 유효기간(2년)',
    description:
      '왕복 귀국 시 한국은 광견병 항체검사를 채혈일 2년 이내로만 인정(채혈 + 2년 ≥ 귀국일). 광견병 비발생 지역산은 면제 — 비발생 지정은 수시 변동하므로 검역본부 확인 안내.',
    severity: 'info',
    addedAt: '2026-06-30',
    run: ({ caseRow, destination }) => {
      // 비발생국 = 한국 귀국 시 항체검사 면제 → 적용 안 함.
      if (isRabiesFreeOrigin(destination)) return SKIP
      // 편도(귀국일 없음) → 적용 안 함. (caseRow.data 는 활성 목적지로 flatten 된 상태.)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ret =
        typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ret)) return SKIP
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      // 귀국일 이전 채혈 중 채혈 + 2년 ≥ 귀국일 인 검사가 하나라도 있으면 유효.
      const valid = titers.find((t) => t.date <= ret && addYears(t.date, 2) >= ret)
      if (valid) {
        return {
          ok: true,
          message: `항체 검사(${valid.date}) 유효기간(${addYears(valid.date, 2)}) ≥ 귀국일(${ret}).`,
        }
      }
      const prior = titers.filter((t) => t.date <= ret)
      const newest = [...(prior.length ? prior : titers)].sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0]
      const expireKr = formatKoreanDate(addYears(newest.date, 2))
      return {
        ok: false,
        message: `광견병 항체 검사 유효기간(2년)이 ${expireKr}에 만료돼요. 한국 귀국 전 재검사가 필요할 수 있어요. (광견병 비발생 지역은 면제)`,
        offendingPaths: titers.map((t) => `rabies_titer_records[${t.originalIndex}].date`),
      }
    },
  },
]
