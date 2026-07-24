/**
 * 광견병 항체검사 기관(titer lab) — 고객/운영자 공용 표시명 + 목적지별 선택지.
 *
 * 단일 출처:
 *  - TITER_LAB_LABELS: 기관 코드 → 표시 이름. APQA 3종(seoul/eu/hq)은 모두 '농림축산검역본부'.
 *  - getTiterLabOptions(destinationKey): 그 목적지에서 고객이 고를 수 있는 기관 목록.
 *    '기타'(직접 입력)는 UI 가 항상 마지막에 덧붙이므로 여기엔 넣지 않는다.
 *
 * APQA 코드는 목적지에 맞는 변형을 직접 지정한다(일본=서울 양식 apqa_seoul,
 * 유럽=EU 인정 양식 apqa_eu). 고객은 어느 변형이든 '농림축산검역본부' 한 이름으로만 본다.
 */
import { EU_ENTRY_FAMILY } from './journey-steps/date-rules'

export interface TiterLabOption {
  value: string
  label: string
}

/** 기관 코드 → 고객 표시 이름. APQA 계열은 전부 '농림축산검역본부'. */
export const TITER_LAB_LABELS: Record<string, string> = {
  apqa_seoul: '농림축산검역본부',
  apqa_eu: '농림축산검역본부',
  apqa_hq: '농림축산검역본부',
  krsl: '코미팜',
  kbnp: '고려비엔피',
  cavac: '중앙백신연구소',
  ksvdl_r: 'Kansas State Rabies Laboratory',
  rias: 'RIAS',
}

/** APQA 3종 — 같은 '농림축산검역본부'로 묶어 선택 상태 매칭에 사용. */
const APQA_CODES = new Set(['apqa_seoul', 'apqa_eu', 'apqa_hq'])

/** 매핑 없는 목적지 기본 선택지 — 현행(농림축산검역본부·코미팜) 유지. */
export const DEFAULT_TITER_LAB_CODES = ['apqa_seoul', 'krsl']

/**
 * 목적지(destinationKey)별 고객 화면 검사기관 선택지(코드, 표시 순서).
 * destinationKey 는 step-detail-view 가 쓰는 정규화 키(japan / thailand / philippines / eu ...).
 */
const TITER_LAB_CODES_BY_DEST: Record<string, string[]> = {
  japan: ['apqa_seoul', 'ksvdl_r'],
  // 하와이 — FAVN 은 USDA 승인 검사기관(Kansas State KSVDL 등). 일본과 동일 선택지(복제).
  hawaii: ['apqa_seoul', 'ksvdl_r'],
  thailand: ['apqa_seoul', 'krsl'],
  philippines: ['apqa_seoul', 'krsl'],
  // 말레이시아·인도네시아 — 태국 복제(2026-07-22). 검사기관은 한국 기관이라 그대로 적용 가능.
  malaysia: ['apqa_seoul', 'krsl'],
  indonesia: ['apqa_seoul', 'krsl'],
  // 유럽 패밀리(EEA·영국·스위스 등 EU_ENTRY_FAMILY): EU 인정 양식(apqa_eu) + 코미팜.
  ...Object.fromEntries(EU_ENTRY_FAMILY.map((k) => [k, ['apqa_eu', 'krsl']])),
  // EU 24개국('eu')은 농림축산검역본부(apqa_eu)만 — 코미팜 제외('기타'는 UI 가 덧붙임).
  // 위 spread 보다 뒤에 둬서 'eu' 키를 덮어쓴다. 스위스·영국 등 나머지 패밀리는 그대로.
  eu: ['apqa_eu'],
}

/** 목적지의 검사기관 코드 목록. 매핑 없으면 기본값. */
export function getTiterLabCodes(destinationKey: string | null | undefined): string[] {
  if (destinationKey && TITER_LAB_CODES_BY_DEST[destinationKey]) {
    return TITER_LAB_CODES_BY_DEST[destinationKey]
  }
  return DEFAULT_TITER_LAB_CODES
}

/** 목적지의 검사기관 선택지(코드 + 표시명). '기타'는 UI 에서 별도 추가. */
export function getTiterLabOptions(destinationKey: string | null | undefined): TiterLabOption[] {
  return getTiterLabCodes(destinationKey).map((value) => ({
    value,
    label: TITER_LAB_LABELS[value] ?? value,
  }))
}

/** 알려진 기관 코드인지(=직접 입력 '기타'가 아닌지) 판별. */
export function isKnownTiterLab(code: string): boolean {
  return code in TITER_LAB_LABELS
}

/**
 * 두 코드가 고객 화면상 같은 기관인지 — 선택 버튼 하이라이트용.
 * APQA 변형(seoul/eu/hq)끼리는 같은 '농림축산검역본부'로 본다(저장값이 목적지 변형과
 * 달라도 버튼이 선택 표시되도록).
 */
export function isSameTiterLab(a: string, b: string): boolean {
  if (a === b) return true
  return APQA_CODES.has(a) && APQA_CODES.has(b)
}
