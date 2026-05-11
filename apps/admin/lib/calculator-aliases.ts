/**
 * 계산기 목적지 alias.
 *
 * - CAT_VARIANTS: 종(species)이 cat 일 때 부모 국가 → 별도 (고양이) 변종 row
 *   (호주(고양이) 등 calculator_items 에 실제 row 존재)
 * - EU_ALIASES: 유럽연합 회원국 → '유럽' 공유 (회원국별 row 미존재, '유럽' row 재사용)
 *   아일랜드는 별도 항목이 존재하므로 alias 에서 제외.
 */

export const CAT_VARIANTS: Record<string, string> = {
  '호주': '호주(고양이)',
  '뉴질랜드': '뉴질랜드(고양이)',
}

export const EU_ALIASES: Record<string, string> = {
  '오스트리아': '유럽',
  '벨기에': '유럽',
  '불가리아': '유럽',
  '크로아티아': '유럽',
  '키프로스': '유럽',
  '체코': '유럽',
  '덴마크': '유럽',
  '에스토니아': '유럽',
  '핀란드': '유럽',
  '프랑스': '유럽',
  '독일': '유럽',
  '그리스': '유럽',
  '헝가리': '유럽',
  '이탈리아': '유럽',
  '라트비아': '유럽',
  '리투아니아': '유럽',
  '룩셈부르크': '유럽',
  '몰타': '유럽',
  '네덜란드': '유럽',
  '폴란드': '유럽',
  '포르투갈': '유럽',
  '루마니아': '유럽',
  '슬로바키아': '유럽',
  '슬로베니아': '유럽',
  '스페인': '유럽',
  '스웨덴': '유럽',
}

export const EU_ALIAS_NAMES = Object.keys(EU_ALIASES)

export function resolveCalculatorCountry(
  country: string,
  species: 'dog' | 'cat',
): string {
  if (EU_ALIASES[country]) return EU_ALIASES[country]
  if (species === 'cat' && CAT_VARIANTS[country]) return CAT_VARIANTS[country]
  return country
}

export function isEuAliasCountry(country: string): boolean {
  return country in EU_ALIASES
}
