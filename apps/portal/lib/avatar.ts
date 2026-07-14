import type { CaseRow } from '@petmove/domain'

/**
 * 펫 아바타 — 보호자가 케이스별로 설정. 우선순위: avatar_photo_url > avatar_color + 이니셜.
 *
 * 보호자 아바타(customer_profiles)와 동일 모델 — 사진 > 색상 원 + 이름 이니셜.
 * (이모지 picker 는 제거됨. avatar_emoji 컬럼은 legacy 로 남아있으나 표시·입력 모두 미사용.)
 *
 * 미설정 시 fallback:
 *   - 이니셜 → pet_name 첫 글자 (한글 1자, 영문 첫 자) 또는 '·'
 *   - 색상 → case.id 해시 또는 리스트 index 로 팔레트 순환 (같은 케이스는 항상 같은 색)
 */

export type AvatarColorId =
  | 'orange'
  | 'purple'
  | 'sage'
  | 'rose'
  | 'ocean'
  | 'sand'
  | 'slate'
  | 'terracotta'

// 순서가 곧 "n번째 케이스에 어떤 색을 줄지". 첫 동물(index 0)은 브랜드 하늘색(ocean)
// 으로 시작 — 로고 타일과 같은 그라데이션(브랜드 첫인상). 이어서 화사한 파스텔,
// 차분한 2색(slate/purple)을 뒤로. picker grid 표시 순서도 이 배열 그대로.
// (2026-07-11 새 디자인 시스템: 구 에디토리얼 웜톤 → 하늘/파스텔 6종. id 는 DB 저장값이라
//  유지하고 각 id 의 색값만 같은 계열의 새 톤으로 교체 — 저장된 선택이 자연스럽게 이어짐.
//  sand·terracotta 는 팔레트에서 은퇴 — 그리드·새 저장에선 빠지되(profile.ts 화이트리스트가
//  이 배열 참조) 이미 저장된 동물은 아래 GRADIENTS 의 legacy 값으로 계속 렌더된다.)
export const AVATAR_COLOR_IDS: readonly AvatarColorId[] = [
  'ocean',
  'sage',
  'rose',
  'orange',
  'slate',
  'purple',
] as const

export const AVATAR_GRADIENTS: Record<AvatarColorId, string> = {
  /** 브랜드 하늘 — 로고 타일과 동일 그라데이션. */
  ocean: 'linear-gradient(135deg, #63C9FF 0%, #0BAEFF 100%)',
  sage: 'linear-gradient(135deg, #7FE3C6 0%, #2EC79E 100%)',
  rose: 'linear-gradient(135deg, #F8BCCB 0%, #EE8FA9 100%)',
  orange: 'linear-gradient(135deg, #FFC08A 0%, #F59A4B 100%)',
  slate: 'linear-gradient(135deg, #C7CFDD 0%, #96A2B6 100%)',
  purple: 'linear-gradient(135deg, #CBC2F6 0%, #9787E6 100%)',
  /* legacy — 그리드에서 은퇴(새 저장 불가), 기존 저장 동물 렌더 전용. */
  sand: 'linear-gradient(135deg, #F6DDA2 0%, #E3BA60 100%)',
  terracotta: 'linear-gradient(135deg, #F4C4A6 0%, #DB9067 100%)',
}

/**
 * 각 그라데이션 위에 올리는 이니셜 글자색. 밝은 파스텔은 같은 계열 진한 색,
 * 채도 있는 중간톤(ocean·purple)은 흰색 — 대비 확보.
 */
export const AVATAR_TEXT_COLORS: Record<AvatarColorId, string> = {
  ocean: '#FFFFFF',
  purple: '#FFFFFF',
  sage: '#075E48',
  rose: '#93395A',
  sand: '#77571A',
  orange: '#7E4A12',
  terracotta: '#7C401E',
  slate: '#3B495E',
}

/** 아바타 배경색에 맞는 이니셜 글자색. color 없으면 기본(accent-soft 위 accent). */
export function avatarTextColor(color: AvatarColorId | null): string {
  return color ? AVATAR_TEXT_COLORS[color] : 'var(--pm-accent)'
}

/**
 * Index 정보 없는 호출자(단일 케이스 페이지 등)를 위한 hash fallback.
 * 보호자 케이스 목록(Picker)에선 index 를 넘겨 충돌 없는 순환 사용.
 */
const HASH_CYCLE: readonly AvatarColorId[] = AVATAR_COLOR_IDS

export function isAvatarColorId(value: string | null | undefined): value is AvatarColorId {
  // AVATAR_COLOR_IDS(그리드 6종)가 아니라 GRADIENTS 전체 키 기준 — 은퇴한 색(sand 등)을
  // 이미 저장해둔 동물의 아바타가 하루아침에 다른 색으로 바뀌지 않도록 legacy 렌더 유지.
  return !!value && value in AVATAR_GRADIENTS
}

function hashColorFor(id: string): AvatarColorId {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HASH_CYCLE[h % HASH_CYCLE.length]
}

/**
 * 케이스에 실제 적용되는 색 ID. 우선순위:
 *   1. avatar_color 명시 설정 → 그 색
 *   2. index 인자 전달됨 → AVATAR_COLOR_IDS[index % 8] (충돌 없음)
 *   3. fallback → case.id 해시
 */
export function avatarColorId(
  c: Pick<CaseRow, 'id' | 'avatar_color'>,
  index?: number,
): AvatarColorId {
  if (isAvatarColorId(c.avatar_color)) return c.avatar_color
  if (typeof index === 'number' && index >= 0) {
    return AVATAR_COLOR_IDS[index % AVATAR_COLOR_IDS.length]
  }
  return hashColorFor(c.id)
}

/** 케이스의 그라데이션 (avatarColorId 해석값 기준). */
export function avatarGradient(
  c: Pick<CaseRow, 'id' | 'avatar_color'>,
  index?: number,
): string {
  return AVATAR_GRADIENTS[avatarColorId(c, index)]
}

/** 케이스 아바타 위 이니셜 글자색 (배경색에 맞춤). */
export function avatarGlyphColor(
  c: Pick<CaseRow, 'id' | 'avatar_color'>,
  index?: number,
): string {
  return AVATAR_TEXT_COLORS[avatarColorId(c, index)]
}

/** 펫 아바타 사진 URL (있으면 색·이니셜보다 우선). */
export function avatarPhoto(c: Pick<CaseRow, 'avatar_photo_url'>): string | null {
  return c.avatar_photo_url || null
}

/** 아바타 이니셜 — pet_name 첫 글자(한글 1자/영문 첫 자) 또는 '·'. */
export function avatarGlyph(c: Pick<CaseRow, 'pet_name'>): string {
  const name = c.pet_name ?? ''
  return name.slice(0, 1) || '·'
}
