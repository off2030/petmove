/**
 * 케이스 상세 페이지의 동물정보 표시 모드 — 조직별 설정.
 * - false (default): 영문만 표기
 * - true: "한글 | 영문" 병기 (이름 필드와 동일 패턴)
 */
export type DetailViewSettings = {
  species_bilingual: boolean
  breed_bilingual: boolean
  color_bilingual: boolean
  sex_bilingual: boolean
}

export const DETAIL_VIEW_DEFAULTS: DetailViewSettings = {
  species_bilingual: false,
  breed_bilingual: false,
  color_bilingual: false,
  sex_bilingual: false,
}
