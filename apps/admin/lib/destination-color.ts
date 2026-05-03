/**
 * 목적지 → 6-tone universal palette 매핑.
 * 토큰 (--pmw-chip-*) 은 스킨별로 정의되어 자동 분기.
 *
 * 지역 → 톤:
 *   - 일본          → red (단독 시그니처)
 *   - 기타 아시아    → amber (warm)
 *   - 유럽          → blue (cool)
 *   - 미주          → olive (green)
 *   - 오세아니아     → plum (purple)
 *   - 기타          → neutral
 */
const TONES = {
  red:     { bg: 'bg-pmw-chip-red',     text: 'text-pmw-chip-red-foreground' },
  amber:   { bg: 'bg-pmw-chip-amber',   text: 'text-pmw-chip-amber-foreground' },
  olive:   { bg: 'bg-pmw-chip-olive',   text: 'text-pmw-chip-olive-foreground' },
  blue:    { bg: 'bg-pmw-chip-blue',    text: 'text-pmw-chip-blue-foreground' },
  plum:    { bg: 'bg-pmw-chip-plum',    text: 'text-pmw-chip-plum-foreground' },
  neutral: { bg: 'bg-pmw-chip-neutral', text: 'text-pmw-chip-neutral-foreground' },
} as const

export type DestColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

const COUNTRY_TO_TONE: Record<string, ToneKey> = {
  // === 일본 (red 단독) ===
  '일본': 'red',

  // === 아시아 (amber) ===
  '한국': 'amber',
  '중국': 'amber',
  '대만': 'amber',
  '홍콩': 'amber',
  '싱가포르': 'amber',
  '태국': 'amber',
  '베트남': 'amber',
  '필리핀': 'amber',
  '인도네시아': 'amber',
  '말레이시아': 'amber',
  '인도': 'amber',

  // === 유럽 (blue) ===
  '영국': 'blue',
  '프랑스': 'blue',
  '독일': 'blue',
  '스페인': 'blue',
  '이탈리아': 'blue',
  '스위스': 'blue',
  '스웨덴': 'blue',
  '노르웨이': 'blue',
  '덴마크': 'blue',
  '네덜란드': 'blue',
  '터키': 'blue',

  // === 미주 (olive) ===
  '미국': 'olive',
  '캐나다': 'olive',
  '브라질': 'olive',
  '멕시코': 'olive',
  '아르헨티나': 'olive',

  // === 오세아니아 (plum) ===
  '호주': 'plum',
  '뉴질랜드': 'plum',
  '하와이': 'plum',

  // 특수 — 아시아 우선
  '인도네시아·하와이': 'amber',

  // === 영문 ===
  'japan': 'red',
  'korea': 'amber',
  'china': 'amber',
  'taiwan': 'amber',
  'hong kong': 'amber',
  'singapore': 'amber',
  'thailand': 'amber',
  'vietnam': 'amber',
  'philippines': 'amber',
  'indonesia': 'amber',
  'malaysia': 'amber',
  'india': 'amber',
  'uk': 'blue',
  'united kingdom': 'blue',
  'britain': 'blue',
  'france': 'blue',
  'germany': 'blue',
  'spain': 'blue',
  'italy': 'blue',
  'switzerland': 'blue',
  'sweden': 'blue',
  'norway': 'blue',
  'denmark': 'blue',
  'netherlands': 'blue',
  'turkey': 'blue',
  'usa': 'olive',
  'us': 'olive',
  'united states': 'olive',
  'canada': 'olive',
  'brazil': 'olive',
  'mexico': 'olive',
  'argentina': 'olive',
  'australia': 'plum',
  'new zealand': 'plum',
  'nz': 'plum',
  'hawaii': 'plum',
}

/**
 * 목적지 문자열 → tone.
 * 매치 실패 시 neutral (gray).
 * 복수 국가("일본, 호주") 는 첫 번째 매치 사용.
 */
export function destColor(dest: string): DestColor {
  const normalized = dest.trim().toLowerCase()
  if (COUNTRY_TO_TONE[dest.trim()]) return TONES[COUNTRY_TO_TONE[dest.trim()]]
  if (COUNTRY_TO_TONE[normalized]) return TONES[COUNTRY_TO_TONE[normalized]]
  for (const key of Object.keys(COUNTRY_TO_TONE)) {
    if (dest.includes(key) || normalized.includes(key)) return TONES[COUNTRY_TO_TONE[key]]
  }
  return TONES.neutral
}
