/**
 * 검사기관(lab) → 톤 매핑. destination-color 와 동일한 저채도 팔레트.
 */
const TONES = {
  sage:       { bg: 'bg-[#D2DEDC] dark:bg-[#2F4442]', text: 'text-[#3F5A57] dark:text-[#BED0CE]' },
  navy:       { bg: 'bg-[#D4D9E2] dark:bg-[#343A48]', text: 'text-[#384560] dark:text-[#C2C9D6]' },
  indigo:     { bg: 'bg-[#D8D6E4] dark:bg-[#3A374C]', text: 'text-[#4B4A6D] dark:text-[#C6C3D6]' },
  amber:      { bg: 'bg-[#E5D9C2] dark:bg-[#4A412D]', text: 'text-[#6B5A3A] dark:text-[#DBCDB0]' },
  olive:      { bg: 'bg-[#DBE4D6] dark:bg-[#364332]', text: 'text-[#3F5A35] dark:text-[#C4D4B9]' },
  terracotta: { bg: 'bg-[#E8D6C6] dark:bg-[#4D3A2C]', text: 'text-[#6B4F3A] dark:text-[#DDC4B2]' },
} as const

export type LabColor = (typeof TONES)[keyof typeof TONES]
type ToneKey = keyof typeof TONES

const LAB_TO_TONE: Record<string, ToneKey> = {
  krsl: 'sage',
  apqa_seoul: 'navy',
  apqa_hq: 'indigo',
  ksvdl_r: 'amber',
  ksvdl: 'olive',
  vbddl: 'terracotta',
}

export function labColor(lab: string | null | undefined): LabColor | null {
  if (!lab) return null
  const key = lab.toLowerCase().trim()
  if (LAB_TO_TONE[key]) return TONES[LAB_TO_TONE[key]]
  return null
}
