import type { CaseRow } from '@petmove/domain'

/**
 * 펫 아바타 — 보호자가 케이스별로 설정. cases.avatar_emoji / cases.avatar_color.
 *
 * 미설정 시 fallback:
 *   - 이모지 자리 → pet_name 첫 글자 (한글 1자, 영문 첫 자) 또는 '·'
 *   - 색상 자리 → case.id 해시로 팔레트 순환 (같은 케이스는 항상 같은 색)
 *
 * TopBar 스위처(30px 원형)와 /me Profile 펫 카드(52px 원형) 가 공유.
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

export const AVATAR_COLOR_IDS: readonly AvatarColorId[] = [
  'orange',
  'purple',
  'sage',
  'rose',
  'ocean',
  'sand',
  'slate',
  'terracotta',
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

/** Hash fallback 시 사용되는 자동 색상 cycle — 8색 전체 순환. */
const HASH_CYCLE: readonly AvatarColorId[] = AVATAR_COLOR_IDS

export const AVATAR_EMOJIS: readonly string[] = [
  '🐶',
  '🐱',
  '🐰',
  '🐹',
  '🐢',
  '🐦',
  '🦜',
  '🐾',
] as const

export function isAvatarColorId(value: string | null | undefined): value is AvatarColorId {
  return !!value && (AVATAR_COLOR_IDS as readonly string[]).includes(value)
}

function hashColorFor(id: string): AvatarColorId {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HASH_CYCLE[h % HASH_CYCLE.length]
}

export function avatarGradient(c: Pick<CaseRow, 'id' | 'avatar_color'>): string {
  const id = isAvatarColorId(c.avatar_color) ? c.avatar_color : hashColorFor(c.id)
  return AVATAR_GRADIENTS[id]
}

export function avatarGlyph(c: Pick<CaseRow, 'pet_name' | 'avatar_emoji'>): string {
  if (c.avatar_emoji && c.avatar_emoji.length > 0) return c.avatar_emoji
  const name = c.pet_name ?? ''
  return name.slice(0, 1) || '·'
}

/** 글리프가 이모지인지 (= 사용자가 설정함) — 폰트 크기 조정용. */
export function avatarIsEmoji(c: Pick<CaseRow, 'avatar_emoji'>): boolean {
  return !!c.avatar_emoji && c.avatar_emoji.length > 0
}
