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

// 순서가 곧 "n번째 케이스에 어떤 색을 줄지" — 화사한 5색을 먼저, 어두운 2색(slate/purple)을 뒤로.
// picker grid 표시 순서도 이 배열을 그대로 따라가므로 사용자가 보기에도 화사한 색이 먼저 보임.
export const AVATAR_COLOR_IDS: readonly AvatarColorId[] = [
  'sage',
  'rose',
  'ocean',
  'sand',
  'terracotta',
  'orange',
  'slate',
  'purple',
] as const

export const AVATAR_GRADIENTS: Record<AvatarColorId, string> = {
  orange: 'linear-gradient(135deg, #E5A776 0%, #C9824D 100%)',
  purple: 'linear-gradient(135deg, #4A4458 0%, #28252E 100%)',
  sage: 'linear-gradient(135deg, #C9DBCB 0%, #97B69A 100%)',
  rose: 'linear-gradient(135deg, #E8B4B0 0%, #D49591 100%)',
  ocean: 'linear-gradient(135deg, #A4C5D6 0%, #6E9DB6 100%)',
  sand: 'linear-gradient(135deg, #E8D7A8 0%, #C9B377 100%)',
  slate: 'linear-gradient(135deg, #B6BCC8 0%, #7E8794 100%)',
  terracotta: 'linear-gradient(135deg, #D69570 0%, #B47453 100%)',
}

/**
 * 각 그라데이션 위에 올리는 이니셜 글자색. 밝은 파스텔(sage·rose·ocean·sand·slate)은
 * 같은 계열 진한 색, 어두운/채도 높은 색(orange·terracotta·purple)은 흰색 — 대비 확보.
 */
export const AVATAR_TEXT_COLORS: Record<AvatarColorId, string> = {
  orange: '#FFFFFF',
  purple: '#FFFFFF',
  terracotta: '#FFFFFF',
  sage: '#3F5C43',
  rose: '#8A4744',
  ocean: '#2F5167',
  sand: '#6E5727',
  slate: '#3A4150',
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
  return !!value && (AVATAR_COLOR_IDS as readonly string[]).includes(value)
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
