/**
 * 검사기관(lab) → 6-tone universal palette 매핑.
 * 토큰 (--pmw-chip-*) 은 스킨별로 정의되어 자동 분기.
 * 8개 lab 을 6 tone 으로 묶어 구분 (같은 톤 내에서는 lab 라벨 텍스트로 구분).
 */
const TONES = {
  red:     { bg: 'bg-pmw-chip-red',     text: 'text-pmw-chip-red-foreground' },
  amber:   { bg: 'bg-pmw-chip-amber',   text: 'text-pmw-chip-amber-foreground' },
  olive:   { bg: 'bg-pmw-chip-olive',   text: 'text-pmw-chip-olive-foreground' },
  blue:    { bg: 'bg-pmw-chip-blue',    text: 'text-pmw-chip-blue-foreground' },
  plum:    { bg: 'bg-pmw-chip-plum',    text: 'text-pmw-chip-plum-foreground' },
  neutral: { bg: 'bg-pmw-chip-neutral', text: 'text-pmw-chip-neutral-foreground' },
} as const

export type LabColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

/** lab → tone. 같은 종류 라벨끼리 묶음. */
const LAB_TO_TONE: Record<string, ToneKey> = {
  krsl: 'olive',
  apqa_seoul: 'amber',
  apqa_hq: 'olive',
  ksvdl_r: 'red',
  ksvdl: 'olive',
  vbddl: 'plum',
}

export function labColor(lab: string | null | undefined): LabColor | null {
  if (!lab) return null
  const key = lab.toLowerCase().trim()
  if (LAB_TO_TONE[key]) return TONES[LAB_TO_TONE[key]]
  return null
}
