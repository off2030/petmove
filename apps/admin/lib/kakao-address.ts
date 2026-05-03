/**
 * Kakao Local REST API 주소검색.
 *
 * 이미지 추출로는 사진 안에 우편번호가 안 적혀 있으면 얻을 수 없어서,
 * AI가 돌려준 한글 주소 문자열을 Kakao에 조회해 우편번호(zone_no)를 채운다.
 *
 * Docs: https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-address
 */

interface KakaoRoadAddress {
  zone_no: string | null
  address_name: string | null
}

interface KakaoDocument {
  road_address: KakaoRoadAddress | null
  address: { zip_code?: string | null } | null
}

interface KakaoResponse {
  documents: KakaoDocument[]
}

export interface KakaoAddressLookup {
  zipcode: string | null
}

/**
 * "금천구 벚꽃로40 102동 504호" 처럼 시/도 누락 + 동/호수가 붙은 주소도
 * 매칭되도록 쿼리 후보를 여러 개 생성해서 순서대로 시도.
 *
 * - 원본
 * - 동·호·번지·빌딩 이후 잘라낸 도로명/지번까지
 * - 숫자 앞 공백 보정 ("벚꽃로40" → "벚꽃로 40")
 */
function buildQueryCandidates(raw: string): string[] {
  const base = raw.replace(/\s+/g, ' ').trim()
  if (!base) return []
  const set = new Set<string>()
  set.add(base)

  // 공백 보정: "로40" → "로 40", "길12" → "길 12"
  const spaced = base.replace(/([가-힣])(\d)/g, '$1 $2')
  if (spaced !== base) set.add(spaced)

  // 동·호·층·번지 등 부가 토큰 잘라내기 — 도로명+번지까지만 남김
  const trimmed = spaced.replace(/\s+\S*(동|호|층|번지|가구|세대).*$/u, '').trim()
  if (trimmed && trimmed !== spaced) set.add(trimmed)

  return Array.from(set)
}

export async function lookupKoreanZipcode(
  addressKr: string,
): Promise<KakaoAddressLookup | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) {
    console.warn('[kakao-address] KAKAO_REST_API_KEY not set')
    return null
  }
  const candidates = buildQueryCandidates(addressKr)
  if (candidates.length === 0) return null

  for (const query of candidates) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=1`,
        { headers: { Authorization: `KakaoAK ${key}` } },
      )
      if (!res.ok) {
        console.warn(`[kakao-address] HTTP ${res.status} for query="${query}"`)
        continue
      }
      const json = (await res.json()) as KakaoResponse
      const doc = json.documents?.[0]
      if (!doc) continue
      const zipcode =
        doc.road_address?.zone_no?.trim() ||
        doc.address?.zip_code?.trim() ||
        null
      if (zipcode) return { zipcode }
    } catch (err) {
      console.warn(`[kakao-address] fetch failed for query="${query}"`, err)
    }
  }
  return null
}
