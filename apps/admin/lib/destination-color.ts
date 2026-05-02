/**
 * Juniper & Pearl 스타일 — 저채도 톤(saturation ≤ 20%).
 * 지역별로 계열을 나누고, 같은 계열 안에서 음영 변주로 변별.
 *   - 일본          → red (단독)
 *   - 기타 아시아    → orange family (amber·terracotta·peach·coral·mustard)
 *   - 유럽          → blue family (blue·navy·indigo·teal·slate·steel)
 *   - 미주          → green family (olive·sage·mint·forest)
 *   - 오세아니아     → purple family (violet·lavender·plum)
 *   - 기타          → charcoal
 */
const TONES = {
  // 일본 — 일장기
  red:        { bg: 'bg-[#EDD6D0] dark:bg-[#4D3631]', text: 'text-[#7A4A40] dark:text-[#E3C4BE]' },

  // 아시아 — 주황 계열
  amber:      { bg: 'bg-[#E5D9C2] dark:bg-[#4A412D]', text: 'text-[#6B5A3A] dark:text-[#DBCDB0]' },
  terracotta: { bg: 'bg-[#E8D6C6] dark:bg-[#4D3A2C]', text: 'text-[#6B4F3A] dark:text-[#DDC4B2]' },
  peach:      { bg: 'bg-[#EDD8CF] dark:bg-[#4A372F]', text: 'text-[#75513F] dark:text-[#E0C5B6]' },
  coral:      { bg: 'bg-[#EFD0C5] dark:bg-[#4F3328]', text: 'text-[#7A4733] dark:text-[#E5BFAE]' },
  mustard:    { bg: 'bg-[#DFD0A5] dark:bg-[#443B22]', text: 'text-[#5E4F25] dark:text-[#D4C28F]' },

  // 유럽 — warm-leaning gray/blue (cool 톤 다운)
  blue:       { bg: 'bg-[#DBDFE2] dark:bg-[#3B3F45]', text: 'text-[#475260] dark:text-[#C4CAD2]' },
  navy:       { bg: 'bg-[#D8DAE0] dark:bg-[#3A3D45]', text: 'text-[#42485C] dark:text-[#C2C5CE]' },
  indigo:     { bg: 'bg-[#DEDADD] dark:bg-[#3F3A40]', text: 'text-[#544D62] dark:text-[#C9C2CD]' },
  teal:       { bg: 'bg-[#D5DDD8] dark:bg-[#36403B]', text: 'text-[#42554C] dark:text-[#BFCBC4]' },
  slate:      { bg: 'bg-[#DAD8D5] dark:bg-[#3A3937]', text: 'text-[#4D4A45] dark:text-[#C5C2BD]' },
  steel:      { bg: 'bg-[#D6D8DC] dark:bg-[#393A40]', text: 'text-[#42495A] dark:text-[#BFC4CB]' },

  // 미주 — warm olive 계열
  olive:      { bg: 'bg-[#DFE0CB] dark:bg-[#42432B]', text: 'text-[#4A5028] dark:text-[#CDD0B0]' },
  sage:       { bg: 'bg-[#D8DBC9] dark:bg-[#3D402D]', text: 'text-[#4D5230] dark:text-[#C5C9B0]' },
  mint:       { bg: 'bg-[#D2DECC] dark:bg-[#363D2C]', text: 'text-[#42523A] dark:text-[#BCC9B0]' },
  forest:     { bg: 'bg-[#CBD8C2] dark:bg-[#2C3528]', text: 'text-[#3A4A2C] dark:text-[#B6C5A8]' },

  // 오세아니아 — 퍼플 계열
  violet:     { bg: 'bg-[#DDD4E2] dark:bg-[#3D344A]', text: 'text-[#564776] dark:text-[#C9C0DB]' },
  lavender:   { bg: 'bg-[#DCD8E5] dark:bg-[#3A374A]', text: 'text-[#4F4970] dark:text-[#C8C3D8]' },
  plum:       { bg: 'bg-[#DCD2DE] dark:bg-[#3D2F44]', text: 'text-[#5C3F66] dark:text-[#CCBCD0]' },

  // 기타
  charcoal:   { bg: 'bg-[#D6D5D1] dark:bg-[#3A3A37]', text: 'text-[#3E3E3A] dark:text-[#CACAC5]' },
} as const

export type DestColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

/** 한국어·영어 국가명 → 톤 매핑. 지역 계열 안에서 음영 변주. */
const COUNTRY_TO_TONE: Record<string, ToneKey> = {
  // === 일본 (red 단독) ===
  '일본': 'red',

  // === 아시아 (주황 계열) ===
  '한국': 'peach',
  '중국': 'amber',
  '대만': 'mustard',
  '홍콩': 'terracotta',
  '싱가포르': 'coral',
  '태국': 'amber',
  '베트남': 'peach',
  '필리핀': 'coral',
  '인도네시아': 'terracotta',
  '말레이시아': 'mustard',
  '인도': 'peach',

  // === 유럽 (블루 계열) ===
  '영국': 'indigo',
  '프랑스': 'navy',
  '독일': 'slate',
  '스페인': 'steel',
  '이탈리아': 'teal',
  '스위스': 'blue',
  '스웨덴': 'blue',
  '노르웨이': 'navy',
  '덴마크': 'indigo',
  '네덜란드': 'steel',
  '터키': 'teal',

  // === 미주 (그린 계열) ===
  '미국': 'olive',
  '캐나다': 'sage',
  '브라질': 'forest',
  '멕시코': 'mint',
  '아르헨티나': 'sage',

  // === 오세아니아 (퍼플 계열) ===
  '호주': 'violet',
  '뉴질랜드': 'plum',
  '하와이': 'lavender',

  // 특수 — 아시아 우선
  '인도네시아·하와이': 'terracotta',

  // === 영문 ===
  'japan': 'red',
  'korea': 'peach',
  'china': 'amber',
  'taiwan': 'mustard',
  'hong kong': 'terracotta',
  'singapore': 'coral',
  'thailand': 'amber',
  'vietnam': 'peach',
  'philippines': 'coral',
  'indonesia': 'terracotta',
  'malaysia': 'mustard',
  'india': 'peach',
  'uk': 'indigo',
  'united kingdom': 'indigo',
  'britain': 'indigo',
  'france': 'navy',
  'germany': 'slate',
  'spain': 'steel',
  'italy': 'teal',
  'switzerland': 'blue',
  'sweden': 'blue',
  'norway': 'navy',
  'denmark': 'indigo',
  'netherlands': 'steel',
  'turkey': 'teal',
  'usa': 'olive',
  'us': 'olive',
  'united states': 'olive',
  'canada': 'sage',
  'brazil': 'forest',
  'mexico': 'mint',
  'argentina': 'sage',
  'australia': 'violet',
  'new zealand': 'plum',
  'nz': 'plum',
  'hawaii': 'lavender',
}

const FALLBACK_TONES: ToneKey[] = ['charcoal', 'slate', 'sage', 'lavender', 'mustard', 'mint', 'steel', 'forest']

/**
 * 목적지 문자열 → 톤.
 *   1) COUNTRY_TO_TONE 에 매치되면 그 국가의 지역 계열 톤.
 *   2) 매치 실패 시 문자열 해시 기반 fallback (저채도 중성톤만).
 * 복수 국가("일본, 호주") 는 첫 번째 매치 사용.
 */
export function destColor(dest: string): DestColor {
  const normalized = dest.trim().toLowerCase()
  // Exact match 우선
  if (COUNTRY_TO_TONE[dest.trim()]) return TONES[COUNTRY_TO_TONE[dest.trim()]]
  if (COUNTRY_TO_TONE[normalized]) return TONES[COUNTRY_TO_TONE[normalized]]
  // Substring — 다중 목적지 대비
  for (const key of Object.keys(COUNTRY_TO_TONE)) {
    if (dest.includes(key) || normalized.includes(key)) return TONES[COUNTRY_TO_TONE[key]]
  }
  // Hash fallback
  let h = 0
  for (let i = 0; i < dest.length; i++) h = (h * 31 + dest.charCodeAt(i)) | 0
  return TONES[FALLBACK_TONES[Math.abs(h) % FALLBACK_TONES.length]]
}
