import type { CaseRow } from '../types'

export type CheckSeverity = 'blocker' | 'warning' | 'info'

/**
 * destination-config 의 키와 동일.
 * - 단일 문자열: 한 국가 전용 (예: 'japan')
 * - 배열: 같은 규칙을 여러 국가에 등록 (예: EU 패밀리 ['eu','uk','switzerland',...])
 *
 * **'all' 같은 공통 키는 의도적으로 없음** — 모든 룰은 명시적으로 적용 목적지를
 * 선언해야 한다. 잘못된 가정의 누수(다른 국가에 일본 룰이 새는 등)를 원천 차단.
 */
export type CountryKey = string | string[]

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
  /**
   * 이 룰의 결과를 **누가 보는가**. 생략 = 'customer'(펫무브 앱 보호자에게 노출).
   *
   * 'staff' = 펫무브워크(운영자)에만 표시. 포털은 이 값으로 표시를 거른다 —
   * 예전엔 `PORTAL_SUPPRESSED_CHECKS` 하드코딩 목록 + `relatedCases` 의존 여부를
   * 사람이 조합해 판단해야 해서, "이 문구를 고객이 보는가"를 반복해서 잘못 짚었다.
   *
   * 'customer' 문구는 날짜·이름을 넣지 않는다(`messages.ts` 참고). `pnpm lint:checks` 가
   * 이 값을 기준으로 검사하므로, staff 로 선언하면 날짜를 그대로 쓸 수 있다.
   */
  audience?: 'customer' | 'staff'
  /**
   * 고객 문구에 날짜 보간을 허용 — **날짜가 정보 자체**인 경우만.
   * (일본 '검사일로부터 180일 후 O월 O일에 입국할 수 있어요' / 유효기간 만료일 안내 등)
   * 없으면 lint:checks 가 날짜 보간을 실패로 잡는다.
   */
  allowDate?: boolean
  /** 실제 검증 함수. 생략하면 카탈로그에만 표시되고 케이스 검증은 건너뜀. */
  run?: (ctx: CheckContext) => CheckResult
}

export interface CheckContext {
  caseRow: CaseRow
  /**
   * 같은 조직(테넌트)의 다른 케이스 목록. 동일 보호자 다중 등록 검증(예: CN 1인 1마리)에 사용.
   * 호출자가 제공하지 않으면 cross-case 룰은 SKIP. 자기 자신(caseRow.id) 포함 가능.
   */
  relatedCases?: CaseRow[]
  /**
   * 활성 목적지 토큰 (사용자 입력 그대로의 한글/영문). 다중 목적지 케이스에서
   * `data.by_dest[destination]` 의 출국일·내원일·entry_* 등 destination-scoped 값을
   * 읽기 위함. 미지정(단일 목적지 컨텍스트) 시 헬퍼는 column/top-level fallback.
   */
  destination?: string | null
}

export interface CheckResult {
  ok: boolean
  message: string
  /**
   * 문제 원인이 되는 데이터 경로들. 필드 렌더러에서 색상·툴팁을 띄울 때 사용.
   * 예: 'rabies_dates[1].date', 'departure_date'
   */
  offendingPaths?: string[]
}
