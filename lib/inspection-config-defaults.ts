/**
 * 광견병항체검사·전염병검사 기관 설정. client-safe 상수/타입.
 * 실제 load/save 는 @/lib/inspection-config 에서 (서버 전용).
 */

export interface InspectionLabOverride {
  country: string
  lab: string
}

export interface InspectionConfig {
  /** 광견병항체검사 기본 검사기관. 없으면 KRSL. */
  titerDefault: string
  /** 국가별 광견병항체검사 검사기관 오버라이드. */
  titerOverrides: InspectionLabOverride[]
  /** 전염병검사 기본 검사기관. 없으면 KSVDL. */
  infectiousDefault: string
  /** 국가별 전염병검사 검사기관 오버라이드. */
  infectiousOverrides: InspectionLabOverride[]
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

/**
 * 기본 설정. 기존 하드코딩 규칙을 그대로 옮겨놔서 기본 동작을 유지.
 * 사용자가 설정 화면에서 override 추가·제거·변경 가능.
 */
export const DEFAULT_INSPECTION_CONFIG: InspectionConfig = {
  titerDefault: 'krsl',
  titerOverrides: [
    { country: '싱가포르', lab: 'ksvdl_r' },
    { country: '일본', lab: 'apqa_seoul' },
    { country: '하와이', lab: 'apqa_seoul' },
    // EU + UK
    { country: '독일', lab: 'apqa_hq' },
    { country: '프랑스', lab: 'apqa_hq' },
    { country: '이탈리아', lab: 'apqa_hq' },
    { country: '스페인', lab: 'apqa_hq' },
    { country: '네덜란드', lab: 'apqa_hq' },
    { country: '벨기에', lab: 'apqa_hq' },
    { country: '오스트리아', lab: 'apqa_hq' },
    { country: '스웨덴', lab: 'apqa_hq' },
    { country: '덴마크', lab: 'apqa_hq' },
    { country: '핀란드', lab: 'apqa_hq' },
    { country: '폴란드', lab: 'apqa_hq' },
    { country: '체코', lab: 'apqa_hq' },
    { country: '헝가리', lab: 'apqa_hq' },
    { country: '포르투갈', lab: 'apqa_hq' },
    { country: '그리스', lab: 'apqa_hq' },
    { country: '루마니아', lab: 'apqa_hq' },
    { country: '불가리아', lab: 'apqa_hq' },
    { country: '크로아티아', lab: 'apqa_hq' },
    { country: '슬로바키아', lab: 'apqa_hq' },
    { country: '슬로베니아', lab: 'apqa_hq' },
    { country: '리투아니아', lab: 'apqa_hq' },
    { country: '라트비아', lab: 'apqa_hq' },
    { country: '에스토니아', lab: 'apqa_hq' },
    { country: '룩셈부르크', lab: 'apqa_hq' },
    { country: '몰타', lab: 'apqa_hq' },
    { country: '키프로스', lab: 'apqa_hq' },
    { country: '아일랜드', lab: 'apqa_hq' },
    { country: '영국', lab: 'apqa_hq' },
  ],
  infectiousDefault: 'ksvdl',
  infectiousOverrides: [
    { country: '뉴질랜드', lab: 'apqa_hq' },
  ],
}

/** 목적지 문자열(복수 가능)에서 첫 매칭 오버라이드 검색. 없으면 default 반환. */
export function resolveInspectionLab(
  destination: string | null | undefined,
  overrides: InspectionLabOverride[],
  defaultLab: string,
): string {
  if (!destination) return defaultLab
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  const map = new Map(overrides.map(o => [o.country, o.lab]))
  for (const d of dests) {
    const hit = map.get(d)
    if (hit) return hit
  }
  return defaultLab
}
