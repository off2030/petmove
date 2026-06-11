import { DESTINATION_OVERRIDES } from '../destination-config'
import {
  buildDateRuleContext,
  validateKrExportDate,
  validateVetVisitDate,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import { readVetVisitDate, SKIP } from './utils'

/**
 * 목적지 무관 — 한국 출국 측 공통 절차 검증.
 *
 * 출국 전 임상검사·한국 수출 동물검역은 어느 목적지든 모든 한국발 케이스가 거치는 단계라
 * 모든 목적지에 적용된다. 이는 메모리의 "공통룰 금지(country: 'all' 누수)"가 막는 *특정국
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
    title: '한국 수출 동물검역일',
    description:
      '한국 수출 동물검역일은 출국 전 임상검사 이후·출국일 이전이며 출국일 기준 윈도우 이내여야 함.',
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
]
