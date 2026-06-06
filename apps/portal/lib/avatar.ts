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
 * Index 정보 없는 호출자(단일 케이스 페이지 등)를 위한 hash fallback.
 * 보호자 케이스 목록(TopBar / Picker)에선 index 를 넘겨 충돌 없는 순환 사용.
 */
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

/**
 * 보호자(사람) 아바타용 이모지. 펫 picker 의 동물 세트와 분리 — 보호자에는 사람 모양.
 * 여성·남성·중립 + 연령대를 섞어 누구나 자기 비슷한 걸 고를 수 있게.
 */
export const GUARDIAN_AVATAR_EMOJIS: readonly string[] = [
  '👩',
  '👨',
  '🧑',
  '👧',
  '👦',
  '👵',
  '👴',
  '🧓',
] as const

export function isAvatarColorId(value: string | null | undefined): value is AvatarColorId {
  return !!value && (AVATAR_COLOR_IDS as readonly string[]).includes(value)
}

function hashColorFor(id: string): AvatarColorId {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HASH_CYCLE[h % HASH_CYCLE.length]
}

/**
 * 케이스의 그라데이션. 우선순위:
 *   1. avatar_color 명시 설정 → 그 색
 *   2. index 인자 전달됨 → AVATAR_COLOR_IDS[index % 8] (충돌 없음, 보호자 8케이스까지)
 *   3. fallback → case.id 해시 (호출자가 리스트 컨텍스트 없을 때만)
 */
export function avatarGradient(
  c: Pick<CaseRow, 'id' | 'avatar_color'>,
  index?: number,
): string {
  if (isAvatarColorId(c.avatar_color)) return AVATAR_GRADIENTS[c.avatar_color]
  if (typeof index === 'number' && index >= 0) {
    return AVATAR_GRADIENTS[AVATAR_COLOR_IDS[index % AVATAR_COLOR_IDS.length]]
  }
  return AVATAR_GRADIENTS[hashColorFor(c.id)]
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
