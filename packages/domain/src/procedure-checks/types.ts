import type { CaseRow } from '../types'

export type CheckSeverity = 'blocker' | 'warning' | 'info'

/**
 * destination-config 의 키와 동일.
 * - 단일 문자열: 한 국가 전용 (예: 'japan')
 * - 배열: 같은 규칙을 여러 국가에 등록 (예: EU 패밀리 ['eu','uk','switzerland',...])
 * - 'all': 전 국가 공통
 */
export type CountryKey = string | string[] | 'all'

export interface ProcedureCheck {
  /** 전역 유일 id. `<국가코드>.<이름>` 형식 권장. 예: 'jp.rabies-titer-validity' */
  id: string
  country: CountryKey
  /** 그룹화용 자유 문자열. '광견병' · '마이크로칩' · '서류' · '일정' 등. */
  category: string
  title: string
  /** 왜 필요한지 / 관련 규정 요약. */
  description: string
  severity: CheckSeverity
  /** 도입 시점 'YYYY-MM-DD'. */
  addedAt: string
  /** 실제 검증 함수. 생략하면 카탈로그에만 표시되고 케이스 검증은 건너뜀. */
  run?: (ctx: CheckContext) => CheckResult
}

export interface CheckContext {
  caseRow: CaseRow
}

export interface CheckResult {
  ok: boolean
  message: string
  /** 사용자가 어떻게 고치면 되는지 힌트 (선택). */
  fixHint?: string
  /**
   * 문제 원인이 되는 데이터 경로들. 필드 렌더러에서 색상·툴팁을 띄울 때 사용.
   * 예: 'rabies_dates[1].date', 'departure_date'
   */
  offendingPaths?: string[]
}
