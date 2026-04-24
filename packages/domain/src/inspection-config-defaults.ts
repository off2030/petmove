/**
 * 광견병항체검사·전염병검사 기관 설정. client-safe 상수/타입.
 * 실제 load/save 는 @/lib/inspection-config 에서 (서버 전용).
 */

export interface InspectionLabRule {
  /** 그룹 표시명 (예: "유럽연합"). 단일 국가면 보통 생략. */
  label?: string
  /** 이 규칙이 적용되는 목적지 국가(1개 이상). */
  countries: string[]
  /** 검사기관(1개 이상). 여러 개면 해당 국가 케이스에 검사기관별로 기록이 하나씩 생성됨. */
  labs: string[]
}

export interface InspectionLabOption {
  value: string
  label: string
}

export interface InspectionConfig {
  /** 광견병항체검사 기본 검사기관. 규칙 매칭 없을 때 사용. */
  titerDefault: string
  /** 광견병항체검사 국가별 규칙. */
  titerRules: InspectionLabRule[]
  /** 전염병검사 국가별 규칙. 기본 검사기관 개념 없음 — 매칭되지 않으면 lab 미지정. */
  infectiousRules: InspectionLabRule[]
  /** 광견병항체검사 사용자 정의 기관(`TITER_LABS` 에 없는 기관). 없으면 빈 배열/undef. */
  customTiterLabs?: InspectionLabOption[]
  /** 전염병검사 사용자 정의 기관(`INFECTIOUS_LABS` 에 없는 기관). 없으면 빈 배열/undef. */
  customInfectiousLabs?: InspectionLabOption[]
}

export const TITER_LABS: { value: string; label: string }[] = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
]

export const INFECTIOUS_LABS: { value: string; label: string }[] = [
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'apqa_hq', label: 'APQA HQ' },
]

/** 유럽연합(EU) 27개 회원국 — "유럽연합" 그룹 기본 구성. */
export const EU_COUNTRIES = [
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드',
]

/**
 * 기본 설정. 기존 하드코딩 규칙을 규칙 기반으로 이관.
 * - 광견병: EU는 하나의 그룹으로 묶음. 영국은 EU 회원국 아니어서 별도.
 * - 전염병: 호주·뉴질랜드만 기본 포함. 뉴질랜드는 labs 여러 개(이중 검사).
 */
export const DEFAULT_INSPECTION_CONFIG: InspectionConfig = {
  titerDefault: 'krsl',
  titerRules: [
    { countries: ['싱가포르'], labs: ['ksvdl_r'] },
    { countries: ['일본'], labs: ['apqa_seoul'] },
    { countries: ['하와이'], labs: ['apqa_seoul'] },
    { label: '유럽연합', countries: [...EU_COUNTRIES], labs: ['apqa_hq'] },
    { countries: ['영국'], labs: ['apqa_hq'] },
  ],
  infectiousRules: [
    { countries: ['호주'], labs: ['ksvdl'] },
    { countries: ['뉴질랜드'], labs: ['apqa_hq', 'vbddl'] },
  ],
}

/**
 * 목적지 문자열(복수 콤마 구분 가능)에서 첫 매칭 규칙의 labs 반환. 매칭 없으면 [].
 */
export function resolveInspectionLabs(
  destination: string | null | undefined,
  rules: InspectionLabRule[],
): string[] {
  if (!destination) return []
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  for (const d of dests) {
    for (const r of rules) {
      if (r.countries.includes(d)) return [...r.labs]
    }
  }
  return []
}

/**
 * 광견병항체 호환 — 단일 lab 반환. 규칙 매칭 없으면 default.
 * (타이터는 관례적으로 국가당 한 기관만 쓰므로 첫 lab 사용.)
 */
export function resolveTiterLab(
  destination: string | null | undefined,
  rules: InspectionLabRule[],
  defaultLab: string,
): string {
  const labs = resolveInspectionLabs(destination, rules)
  return labs[0] ?? defaultLab
}
