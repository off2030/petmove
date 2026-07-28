/**
 * 고객 노출 주의 문구의 공용 출처(canonical).
 *
 * 배경: 같은 규정 유형(마이크로칩 순서·최소 일령·유효기간 만료 등)을 나라마다 각자 작성해
 * 25개국에 4가지 표현이 생겼고, 그중 20개국이 날짜를 그대로 노출했다
 * (`마이크로칩(2026-02-13)이 광견병 1차 접종(2026-01-01)보다 늦어요`).
 * 새 목적지를 만들 때 기존 문구를 **상속받는 게 아니라 새로 쓰기 때문에** 매번 어긋난다.
 *
 * 규칙:
 *  - 고객 문구엔 **날짜·이름을 넣지 않는다**. 어느 기록이 문제인지는 `offendingPaths` 가
 *    해당 입력칸을 짚어준다. (검증: `pnpm lint:checks` — customer 문구의 날짜 보간 금지)
 *  - 날짜가 **정보 자체**인 경우만 예외(일본 '검사일로부터 180일 후 O월 O일에 입국할 수
 *    있어요'). 그 룰은 `allowDate: true` 를 선언한다.
 *  - 내부 용어('보수적 기준', 'GACC 한도')를 쓰지 않는다.
 *
 * 문구 원본은 사용자가 검수한 태국·필리핀 카피를 기준으로 삼았다.
 * 나라 고유 사실(중국 GACC 지정 기관, 대만 불활화 백신 등)은 통일 대상이 아니므로
 * 여기 두지 않고 각 나라 파일에 그대로 둔다.
 */

/**
 * 광견병 접종은 마이크로칩 삽입 이후여야 함. (전 목적지 공통)
 * 저장 거부(validateMicrochipBeforeBooster)와 **같은 문장**으로 통일 — 같은 실수를 층마다
 * 다르게 말하지 않는다(2026-07-28 사용자 확정). 한쪽만 고치지 말 것.
 */
export function msgMicrochipBeforeRabies(): string {
  return '마이크로칩 삽입 후 광견병을 접종하세요.'
}

/** 종합백신 접종은 마이크로칩 삽입 이후여야 함. (위와 같은 통일 — 백신 이름만 다름) */
export function msgMicrochipBeforeGeneralVaccine(): string {
  return '마이크로칩 삽입 후 종합백신을 접종하세요.'
}

/**
 * 광견병 1차 접종 최소 일령.
 * @param label 일령 표기 — '84일(12주)' / '91일' / '90일' / '91일과 3개월'(AND 조건국) 등.
 */
export function msgRabiesPrimeMinAge(label: string): string {
  return `광견병 접종은 생후 ${label}이 지나서 할 수 있어요.`
}

/** 광견병 접종은 출국 N일 전까지. */
export function msgRabiesMinDaysBeforeDeparture(days: number): string {
  return `광견병 접종은 출국 ${days}일 전까지 해야 해요.`
}

/** 종합백신 접종은 출국 N일 전까지. */
export function msgGeneralVaccineMinDaysBeforeDeparture(days: number): string {
  return `종합백신 접종은 출국 ${days}일 전까지 해야 해요.`
}

/**
 * 광견병 면역 유효기간이 기준일 전에 만료.
 * @param anchor '출국' | '입국' — 나라별 기준일 표기.
 */
export function msgRabiesExpiredBefore(anchor: '출국' | '입국' = '출국'): string {
  return `광견병 백신 면역 유효기간이 ${anchor} 전에 만료돼요. 만료 전에 추가 접종을 하세요.`
}

/** 종합백신 면역 유효기간이 기준일 전에 만료. */
export function msgGeneralVaccineExpiredBefore(anchor: '출국' | '입국' = '출국'): string {
  return `종합백신 면역 유효기간이 ${anchor} 전에 만료돼요. 만료 전에 추가 접종을 하세요.`
}

/** 도착지 수입 검역일이 그 나라 입국일보다 빠름. */
export function msgImportQuarantineBeforeEntry(country: string): string {
  return `${country} 수입 검역일은 ${country} 입국일보다 빠를 수 없어요. 날짜를 확인하세요.`
}

/** 현지 수출 검역일이 그 나라 입국일보다 빠름. */
export function msgExportQuarantineBeforeEntry(country: string): string {
  return `${country} 수출 검역일은 ${country} 입국일보다 빠를 수 없어요. 날짜를 확인하세요.`
}

/** 현지 수출 검역일이 한국 귀국일보다 늦음. */
export function msgExportQuarantineAfterReturn(country: string): string {
  return `${country} 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.`
}

/** 항체 검사 채혈은 광견병 접종 후 N일 이상 지나서. */
export function msgTiterMinDaysAfterVaccine(days: number): string {
  return `광견병 항체 검사는 접종 후 ${days}일이 지나서 할 수 있어요.`
}

/**
 * 채혈일이 광견병 접종일보다 빠름 (순서 위반).
 * 일본·중국·EU 가 `validateTiterAfterBooster` 로 쓰던 문구가 사실상의 표준이라 그대로 채택
 * (2026-07-19 사용자 확정). 새 목적지는 자기 표현을 만들지 말고 이 함수를 쓸 것.
 */
export function msgTiterBeforeVaccine(opts?: { twoDose?: boolean }): string {
  // 2회 접종국(일본·중국)은 '접종일'이 둘이라 어느 쪽인지 밝혀야 한다. 1차 뒤·2차 앞에
  // 채혈한 보호자가 "1차 뒤에 했는데 왜?"로 읽던 문구였다(2026-07-19 사용자 지적).
  // 카드 문구가 '검사'로 통일돼 있어 여기도 '검사'로 맞춘다('채혈'은 날짜를 가리킬 때만).
  if (opts?.twoDose) {
    return '광견병 항체 검사는 2차 접종 후에 받아야 해요. 날짜를 확인하세요.'
  }
  return '광견병 항체 검사일이 광견병 접종일보다 빨라요. 날짜를 확인하세요.'
}
