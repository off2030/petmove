import { buildDateRuleContext, validateKrExportDate, validateVetVisitDate } from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import { SKIP } from './utils'

/**
 * 목적지와 무관하게 항상 적용되는 공통 절차 검증.
 *
 * 물리적으로 불가능한 데이터(예: 출생 전 시술)처럼 어느 국가 규정에도 어긋나는
 * 케이스를 잡는다. country: 'all' 로 등록 — 모든 목적지 케이스에서 실행.
 */
export const COMMON_CHECKS: ProcedureCheck[] = [
  {
    id: 'common.microchip-after-birth',
    country: 'all',
    category: '마이크로칩',
    title: '마이크로칩 시술 타이밍',
    description: '마이크로칩 시술일은 동물의 생년월일과 같거나 그 이후여야 함.',
    severity: 'info',
    addedAt: '2026-05-16',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const implant =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      if (!birth || !implant) return SKIP

      if (implant < birth) {
        return {
          ok: false,
          message: `마이크로칩 시술일(${implant})이 생년월일(${birth})보다 빠릅니다. 시술일 혹은 생년월일을 확인하세요.`,
          offendingPaths: ['microchip_implant_date', 'birth_date'],
        }
      }
      return { ok: true, message: `마이크로칩 시술일(${implant})이 생년월일 이후.` }
    },
  },
  // ── 검역·검사 일정 자기 검증 ─────────────────────────────────────────
  // 입력 시점 server action 차단과 같은 함수를 재실행 — 앞 단계(항공편 등)를 수정해
  // 이미 입력된 후행 일정이 어긋났을 때 '주의'로 표면화한다.
  {
    id: 'common.vet-visit-date-valid',
    country: 'all',
    category: '내원',
    title: '출국 전 임상검사 일정',
    description: '내원일은 출국일 이전이고 목적지별 윈도우(보통 출국 10일 이내)여야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw = typeof data.vet_visit_date === 'string' ? data.vet_visit_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow)
      const msg = validateVetVisitDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['vet_visit_date'] }
      }
      return { ok: true, message: `내원일(${raw}) 유효 범위 내.` }
    },
  },
  {
    id: 'common.kr-export-quarantine-date-valid',
    country: 'all',
    category: '검역',
    title: '한국 수출 동물검역 일정',
    description: '한국 수출검역일은 임상검사 후·출국 전·목적지별 윈도우 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_export_quarantine_date === 'string'
          ? data.kr_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow)
      const msg = validateKrExportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_export_quarantine_date'] }
      }
      return { ok: true, message: `한국 수출검역일(${raw}) 유효 범위 내.` }
    },
  },
]
