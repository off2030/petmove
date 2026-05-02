/**
 * 검사기관(lab) → 톤 매핑. Warm Stationery 팔레트 — 모든 톤이 warm cream/sand 계열.
 * 같은 brown family 안에서 미묘한 hue 변주로 lab 구분.
 */
const TONES = {
  sage:       { bg: 'bg-[#DDDFC9] dark:bg-[#3D402D]', text: 'text-[#4D5230] dark:text-[#C9CCB0]' }, // warm sage
  sage_light: { bg: 'bg-[#E5E2C9] dark:bg-[#42402D]', text: 'text-[#5C5A30] dark:text-[#CECBB0]' }, // warm sage light
  navy:       { bg: 'bg-[#D5D8E0] dark:bg-[#36383F]', text: 'text-[#3F4858] dark:text-[#C2C7CE]' }, // warm slate
  indigo:     { bg: 'bg-[#DDD8E0] dark:bg-[#3D363F]', text: 'text-[#564670] dark:text-[#C9BFD0]' }, // warm dusty purple
  amber:      { bg: 'bg-[#E5D9C2] dark:bg-[#4A412D]', text: 'text-[#6B5A3A] dark:text-[#DBCDB0]' }, // warm cream (그대로)
  olive:      { bg: 'bg-[#DFE0CB] dark:bg-[#42432B]', text: 'text-[#4A5028] dark:text-[#CDD0B0]' }, // warm olive
  terracotta: { bg: 'bg-[#E8D6C6] dark:bg-[#4D3A2C]', text: 'text-[#6B4F3A] dark:text-[#DDC4B2]' }, // warm clay (그대로)
  rose:       { bg: 'bg-[#EAD1CC] dark:bg-[#4A322C]', text: 'text-[#7A4A42] dark:text-[#DFBFB8]' }, // warm rose (그대로)
} as const

export type LabColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

const LAB_TO_TONE: Record<string, ToneKey> = {
  krsl: 'sage',
  apqa_seoul: 'terracotta',
  apqa_hq: 'sage_light',
  ksvdl_r: 'rose',
  ksvdl: 'olive',
  vbddl: 'indigo',
}

export function labColor(lab: string | null | undefined): LabColor | null {
  if (!lab) return null
  const key = lab.toLowerCase().trim()
  if (LAB_TO_TONE[key]) return TONES[LAB_TO_TONE[key]]
  return null
}
