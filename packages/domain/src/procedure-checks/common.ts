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
    title: '마이크로칩 시술일은 생년월일 이후',
    description: '마이크로칩 시술일은 동물의 생년월일과 같거나 그 이후여야 함.',
    severity: 'blocker',
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
          message: `마이크로칩 시술일(${implant})이 생년월일(${birth})보다 빠릅니다.`,
          fixHint: '마이크로칩은 출생 이후에만 삽입할 수 있습니다. 시술일 또는 생년월일을 확인하세요.',
          offendingPaths: ['microchip_implant_date', 'birth_date'],
        }
      }
      return { ok: true, message: `마이크로칩 시술일(${implant})이 생년월일 이후.` }
    },
  },
  {
    id: 'common.microchip-partial-input',
    country: 'all',
    category: '마이크로칩',
    title: '마이크로칩 번호·시술일 동반 입력',
    description: '마이크로칩 번호와 시술일은 한 쌍 — 한쪽만 입력된 경우 빠진 쪽을 안내.',
    severity: 'info',
    addedAt: '2026-05-20',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const implant =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const number = (caseRow.microchip ?? '').trim()
      const hasNumber = number.length > 0
      const hasImplant = implant.length >= 10
      // 둘 다 있거나 둘 다 없으면 안내 불필요(완료 또는 진행 전).
      if (hasNumber === hasImplant) return SKIP
      if (!hasNumber) {
        return {
          ok: false,
          message: '마이크로칩 번호가 비어 있습니다.',
          fixHint: '마이크로칩 번호를 입력해주세요.',
          offendingPaths: ['microchip'],
        }
      }
      return {
        ok: false,
        message: '마이크로칩 시술일이 비어 있습니다.',
        fixHint: '마이크로칩 삽입 날짜를 입력해주세요.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
]
