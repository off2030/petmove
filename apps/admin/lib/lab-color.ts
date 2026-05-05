/**
 * 검사기관(lab) → 8-tone universal palette 매핑.
 * 토큰 (--pmw-chip-*) 은 스킨별로 정의되어 자동 분기.
 * 7개 lab 을 7개 tone 에 1:1 로 매핑 (neutral 은 destination 폴백 전용).
 */
const TONES = {
  red:     { bg: 'bg-pmw-chip-red',     text: 'text-pmw-chip-red-foreground' },
  amber:   { bg: 'bg-pmw-chip-amber',   text: 'text-pmw-chip-amber-foreground' },
  olive:   { bg: 'bg-pmw-chip-olive',   text: 'text-pmw-chip-olive-foreground' },
  moss:    { bg: 'bg-pmw-chip-moss',    text: 'text-pmw-chip-moss-foreground' },
  blue:    { bg: 'bg-pmw-chip-blue',    text: 'text-pmw-chip-blue-foreground' },
  plum:    { bg: 'bg-pmw-chip-plum',    text: 'text-pmw-chip-plum-foreground' },
  mauve:   { bg: 'bg-pmw-chip-mauve',   text: 'text-pmw-chip-mauve-foreground' },
  neutral: { bg: 'bg-pmw-chip-neutral', text: 'text-pmw-chip-neutral-foreground' },
} as const

export type LabColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

/** lab → tone. 7 lab × 7 tone, 모두 고유 색. */
const LAB_TO_TONE: Record<string, ToneKey> = {
  krsl: 'olive',
  apqa_seoul: 'amber',
  apqa_hq: 'moss',
  apqa_eu: 'blue',
  ksvdl_r: 'red',
  ksvdl: 'mauve',
  vbddl: 'plum',
}

export function labColor(lab: string | null | undefined): LabColor | null {
  if (!lab) return null
  const key = lab.toLowerCase().trim()
  if (LAB_TO_TONE[key]) return TONES[LAB_TO_TONE[key]]
  return null
}
