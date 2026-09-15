import { matchesDestinationKey } from '@petmove/domain'
import type { CaseRow, InspectionLabRule } from '@petmove/domain'

/**
 * 검사 진행상태의 단일 출처.
 *
 * 검사 탭(todos/inspection-table)과 상세페이지(cases/rabies-titer-field,
 * infectious-disease-field)가 **같은 data 키**를 읽고 쓰도록 여기서만 키를 만든다.
 * 두 곳이 각자 키를 조립하면 탭에서 '완료'로 바꾼 검사가 상세에선 '대기'로 보인다.
 */

/** 상태가 붙는 대상. 검사 탭 행의 dateStorage 와 같은 모양. */
export type InspectionStatusTarget =
  | { kind: 'titer'; recordIdx: number }
  | { kind: 'infectious'; lab: string }
  | { kind: 'infectious_multi'; labs: string[] }

export const INSPECTION_STATUS_OPTIONS = [
  { value: 'waiting', label: '대기' },
  { value: 'testing', label: '검사' },
  { value: 'done', label: '완료' },
]

/**
 * 대상별 진행상태 저장 키. 같은 케이스에 항체검사/전염병검사가 동시에 올라온 경우
 * 각 검사의 상태가 독립적으로 관리되도록 분리. 항체검사는 record 인덱스별.
 */
export function inspectionStatusKey(target: InspectionStatusTarget): string {
  if (target.kind === 'titer') return `inspection_status_titer_${target.recordIdx}`
  if (target.kind === 'infectious') return `inspection_status_inf_${target.lab}`
  return `inspection_status_inf_${[...target.labs].sort().join('_')}`
}

/**
 * legacy 케이스단위 `inspection_status` 일괄 done cutoff.
 * 20260425000004_inspection_done_pre_march.sql 가 검사일 < 2026-03-01 케이스를
 * 일괄 done 처리했고, 단일행 시절 UI 도 이 필드만 썼다. 이 날짜 이후 검사일을 가진
 * 행은 "옛 케이스에 새로 추가된 검사"이므로 케이스단위 done 을 상속하면 안 된다.
 */
const INSPECTION_LEGACY_DONE_CUTOFF = '2026-03-01'

/**
 * 진행상태 조회. 대상별 키 우선, 없으면 legacy 폴백.
 *
 * legacy `inspection_status` 는 단일행 시절·pre-March 일괄 done 마이그레이션에서만
 * 쓰인 케이스단위 필드다. 같은 케이스에 새 검사 행이 추가되면 옛 'done' 이 잘못
 * 번지므로, "옛 행"에만 상속해야 한다 — 옛 행 판별:
 *  - titer idx 0: 단일행 시절부터 있던 행 → `inspection_status_titer` → `inspection_status`.
 *  - titer idx ≥ 1: 재검사 신규 record → legacy 무시, 'waiting' 출발.
 *  - infectious / infectious_multi: 검사일이 cutoff 이전이면 옛 행 → legacy 상속,
 *    cutoff 이후(=옛 케이스에 새로 추가된 검사)면 무시하고 'waiting'.
 *    (titer 의 idx 분리와 동일 취지를 날짜로 판별. 호주행 노견에 광견병항체 done
 *    이후 새 전염병검사를 추가하면 stale done 을 물려받던 버그 방지.)
 *
 * @param date 전염병검사 legacy 상속 판별용 검사일. titer 대상에선 무시.
 */
export function readInspectionStatus(
  caseRow: CaseRow,
  target: InspectionStatusTarget,
  date?: string | null,
): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const v = data[inspectionStatusKey(target)]
  if (typeof v === 'string') return v
  if (target.kind === 'titer' && target.recordIdx === 0) {
    // idx 0 는 옛 단일행 시절 부터 있었을 가능성이 있으므로 legacy 폴백 유지.
    // 새 회차가 옛 'done' 을 상속하지 않게 하려면 saveNewRecord 가
    // inspection_status_titer_<newIdx> 를 'waiting' 으로 명시 저장 (rabies-titer-field).
    const legacyTiter = data.inspection_status_titer
    if (typeof legacyTiter === 'string') return legacyTiter
    const legacy = data.inspection_status
    if (typeof legacy === 'string') return legacy
  }
  if (target.kind === 'infectious' || target.kind === 'infectious_multi') {
    const legacy = data.inspection_status
    // 검사일이 있고 cutoff 이전인 옛 행만 케이스단위 done 을 상속.
    // 검사일이 없거나(아직 미검사 → waiting) cutoff 이후면 상속 안 함.
    if (typeof legacy === 'string' && date && date < INSPECTION_LEGACY_DONE_CUTOFF) {
      return legacy
    }
  }
  return 'waiting'
}

/**
 * 상태 색 — 검사 탭 StatusCell 과 동일 규칙.
 * "검사" → primary(테라코타), "완료" → sage, "대기" → tertiary.
 * 지연 경고는 날짜 셀만 물들인다(탭 간 대기 색 불일치 방지, 2026-08-05 통일).
 */
export function inspectionStatusTone(value: string): string {
  if (value === 'testing') return 'text-primary'
  if (value === 'done') return 'text-pmw-positive'
  return 'text-pmw-text-tertiary'
}

export function inspectionStatusLabel(value: string): string {
  return INSPECTION_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? '대기'
}

/**
 * 설정의 규칙에서 특정 국가(예: '뉴질랜드') 규칙의 labs 배열을 찾는다.
 * 표시 순서는 사용자가 설정 → 전염병 규칙에서 멀티 선택한 순서를 그대로 따른다.
 * 매칭 규칙 없거나 labs 비어 있으면 fallback 반환.
 */
export function findInfectiousLabs(
  rules: InspectionLabRule[],
  country: string,
  fallback: string[],
): string[] {
  const rule = rules.find((r) => r.countries.includes(country))
  return rule && rule.labs.length > 0 ? [...rule.labs] : fallback
}

/** 뉴질랜드 전염병검사 = 여러 기관이 한 행·한 상태로 묶인다 (검사 탭과 동일). */
export function nzInfectiousLabs(rules: InspectionLabRule[]): string[] {
  return findInfectiousLabs(rules, '뉴질랜드', ['apqa_hq', 'vbddl'])
}

/**
 * 전염병검사 기록(검사기관) → 상태 대상.
 *
 * 뉴질랜드(강아지)는 검사 탭에서 여러 기관이 **한 행·한 상태**로 묶이므로
 * combined 키를 써야 한다. 상세페이지가 기관별 키를 쓰면 탭에서 바꾼 상태가
 * 상세엔 안 보인다 (그 반대도 마찬가지).
 */
export function infectiousStatusTarget(
  caseRow: CaseRow,
  lab: string,
  infectiousRules: InspectionLabRule[],
): InspectionStatusTarget {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const species = typeof data.species === 'string' ? data.species : ''
  // 탭의 묶음 조건과 동일 — 뉴질랜드 + 강아지 (고양이는 NZ 전염병검사 대상 아님).
  if (species === 'dog' && matchesDestinationKey(caseRow.destination, 'new_zealand')) {
    const nzLabs = nzInfectiousLabs(infectiousRules)
    if (nzLabs.includes(lab)) return { kind: 'infectious_multi', labs: nzLabs }
  }
  return { kind: 'infectious', lab }
}
