/**
 * 검사기관(lab) → 톤 매핑. destination-color 와 동일한 저채도 팔레트.
 */
const TONES = {
  sage:       { bg: 'bg-[#D2DEDC] dark:bg-[#2F4442]', text: 'text-[#3F5A57] dark:text-[#BED0CE]' },
  sage_light: { bg: 'bg-[#E2E8DB] dark:bg-[#3A4737]', text: 'text-[#52624A] dark:text-[#C9D5BE]' },
  navy:       { bg: 'bg-[#D4D9E2] dark:bg-[#343A48]', text: 'text-[#384560] dark:text-[#C2C9D6]' },
  indigo:     { bg: 'bg-[#D8D6E4] dark:bg-[#3A374C]', text: 'text-[#4B4A6D] dark:text-[#C6C3D6]' },
  amber:      { bg: 'bg-[#E5D9C2] dark:bg-[#4A412D]', text: 'text-[#6B5A3A] dark:text-[#DBCDB0]' },
  olive:      { bg: 'bg-[#DBE4D6] dark:bg-[#364332]', text: 'text-[#3F5A35] dark:text-[#C4D4B9]' },
  terracotta: { bg: 'bg-[#E8D6C6] dark:bg-[#4D3A2C]', text: 'text-[#6B4F3A] dark:text-[#DDC4B2]' },
  rose:       { bg: 'bg-[#EAD1CC] dark:bg-[#4A322C]', text: 'text-[#7A4A42] dark:text-[#DFBFB8]' },
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
