import { buildDateRuleContext, validateKrExportDate, validateVetVisitDate } from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import { readRabiesEntries, readTiterEntries, SKIP } from './utils'

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. */
function formatKr(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일`
}

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
  // ── 광견병 체인 정합성 ───────────────────────────────────────────────
  // 항체 검사가 입력된 상태에서 선행 광견병 접종(1차·2차)이 (a) 누락이거나 (b) 항체보다
  // 늦은 경우 '주의'. 보호자가 앞 단계를 수정·삭제해서 체인이 깨졌을 때 후행(항체) step
  // 에 표면화한다. 광견병 백신은 모든 국가의 필수 선행 단계라 country: 'all'.
  {
    id: 'common.rabies-titer-chain-consistent',
    country: 'all',
    category: '광견병',
    title: '광견병 항체 검사 일정',
    description: '광견병 항체 검사일은 광견병 백신(1차·2차) 접종 후여야 하며, 선행이 모두 입력되어 있어야 함.',
    severity: 'warning',
    addedAt: '2026-06-04',
    run: ({ caseRow }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const rabies = readRabiesEntries(caseRow)
      // 가장 이른 항체 검사일 — 180일 대기 기준일과 동일 출처(done-resolver 의 has-titer-entry).
      const titerDate = titers.map((t) => t.date).sort()[0]

      // 시간 순서 위반 우선 — 선행 백신(1차·2차) 중 날짜가 가장 늦은 것과 비교. readRabiesEntries
      // 는 입력 순서라 배열 위치로 최신을 가정할 수 없어, 1·2차 날짜에서 명시적으로 max 를 구한다.
      const primaryDates = rabies.slice(0, 2).map((r) => r.date)
      if (primaryDates.length > 0) {
        const latestPrimary = primaryDates.reduce((m, d) => (d > m ? d : m))
        if (titerDate < latestPrimary) {
          return {
            ok: false,
            message: `광견병 항체 검사일(${formatKr(titerDate)})이 광견병 백신 접종일(${formatKr(latestPrimary)})보다 빠릅니다. 날짜를 확인해 주세요.`,
            offendingPaths: ['rabies_titer_records'],
          }
        }
      }
      // 선행 누락 — 가까운 선행(2차) 우선, 그 다음 1차.
      if (rabies.length < 2) {
        const missing = rabies.length === 0 ? '광견병 1차' : '광견병 2차'
        return {
          ok: false,
          message: `${missing} 정보가 없습니다. 입력해 주세요.`,
          offendingPaths: ['rabies_titer_records'],
        }
      }
      return { ok: true, message: '항체 검사일이 광견병 백신 이후.' }
    },
  },
]
