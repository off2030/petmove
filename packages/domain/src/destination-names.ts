/**
 * 여행지 이름의 정식 표기(canonical) 단일 출처.
 *
 * `data/destinations.json` 의 `ko` 가 정식 명칭이고, `alias` 는 구 표기·통칭이다
 * (터키→튀르키예, 대한민국→한국, 아랍에미레이트→아랍에미리트, 체키아→체코 …).
 *
 * 선택 UI 는 반드시 `DESTINATION_NAMES` 만 보여줘야 한다. 예전에 설정의 여행지
 * 검색이 국가코드 맵(별칭 포함)을 그대로 목록으로 썼던 탓에 "튀르키예"와 "터키"가
 * 서로 다른 여행지처럼 나란히 선택돼 매핑에 둘 다 들어간 적이 있다(2026-08-06).
 */

import destsData from './data/destinations.json'

interface DestEntry {
  ko: string
  en: string
  alias?: string[]
}

const ENTRIES = destsData as DestEntry[]

/** 선택 가능한 여행지 정식 명칭 — 가나다순. 별칭은 포함하지 않는다. */
export const DESTINATION_NAMES: string[] = ENTRIES
  .map(d => d.ko)
  .sort((a, b) => a.localeCompare(b, 'ko'))

const CANONICAL = new Set(DESTINATION_NAMES)

const ALIAS_TO_CANONICAL = new Map<string, string>()
for (const d of ENTRIES) {
  for (const a of d.alias ?? []) {
    const key = a.trim()
    // 다른 나라의 정식 명칭과 겹치는 별칭은 무시 — 정식 명칭이 항상 이긴다.
    if (!key || CANONICAL.has(key) || ALIAS_TO_CANONICAL.has(key)) continue
    ALIAS_TO_CANONICAL.set(key, d.ko)
  }
}

/**
 * 여행지 이름을 정식 표기로. 별칭이 아니면(모르는 이름 포함) 그대로 돌려준다 —
 * 저장된 자유 입력 값을 임의로 버리지 않기 위해서다.
 */
export function canonicalDestination(name: string): string {
  const key = name.trim()
  return ALIAS_TO_CANONICAL.get(key) ?? key
}

/** 정식 명칭 → 영문 표기. */
const KO_TO_EN = new Map<string, string>()
for (const d of ENTRIES) KO_TO_EN.set(d.ko, d.en)

/**
 * 여행지의 영문 표기 — 해외 기관에 내는 서식(KSVDL 등)의 국가 칸에 쓴다.
 * 별칭으로 저장된 값도 정식 표기로 맞춘 뒤 찾는다. 모르는 이름이면 입력값 그대로
 * 돌려준다(임의로 버리지 않는다 — canonicalDestination 과 같은 방침).
 */
export function destinationEnglish(name: string): string {
  const ko = canonicalDestination(name)
  return KO_TO_EN.get(ko) ?? ko
}

/** 정식 명칭 → 검색어 후보(정식 명칭·영문·별칭), 모두 소문자. */
const SEARCH_TOKENS = new Map<string, string[]>()
for (const d of ENTRIES) {
  SEARCH_TOKENS.set(d.ko, [d.ko, d.en, ...(d.alias ?? [])].map(s => s.toLowerCase()))
}

/**
 * 검색어가 이 여행지에 걸리는지 — 영문·별칭도 함께 본다.
 * 목록에 별칭을 노출하진 않지만 "터키"로 검색하면 튀르키예가 나와야 한다.
 */
export function matchesDestination(ko: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const tokens = SEARCH_TOKENS.get(ko)
  return tokens ? tokens.some(t => t.includes(q)) : ko.toLowerCase().includes(q)
}

/** 여행지 목록을 정식 표기로 바꾸고 중복 제거 — 순서는 유지. */
export function canonicalDestinations(names: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const n of names) {
    const c = canonicalDestination(n)
    if (!c || seen.has(c)) continue
    seen.add(c)
    out.push(c)
  }
  return out
}
