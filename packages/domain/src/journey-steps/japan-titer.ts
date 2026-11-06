import { readTiterEntries, type TiterEntry } from '../procedure-checks/utils'

// Supported, positively identified MAFF-designated laboratories. Unknown/free-text labs
// require verification; a matching customer-facing APQA label is not sufficient.
// https://www.maff.go.jp/aqs/animal/dog/lab.html (checked 2026-11-06)
export const JAPAN_TITER_LAB_CODES = ['apqa_seoul', 'ksvdl_r', 'rias'] as const

const labKey = (value: string) => value.trim().toLowerCase().replace(/[\s_().-]/g, '')
const approvedLabNames = new Set([
  ...JAPAN_TITER_LAB_CODES,
  'APQA Seoul',
  'KSVDL-R',
  'Kansas State Rabies Laboratory',
  'Kansas State University Rabies Laboratory',
  'RIASBT',
  'Research Institute for Animal Science in Biochemistry & Toxicology',
  '生物科学安全研究所',
].map(labKey))

export function isJapanTiterLabApproved(lab: unknown): boolean {
  return typeof lab === 'string' && approvedLabNames.has(labKey(lab))
}

function numericResult(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const number = Number.parseFloat(text.replace(/^[≥>]\s*=?\s*/, ''))
  return Number.isFinite(number) ? number : null
}

/** Only Japan-eligible records, preserving storage indexes for editing/offendingPaths. */
export function readJapanTiterEntries(data: Record<string, unknown>, confirmedOnly = false): TiterEntry[] {
  const raw = Array.isArray(data.rabies_titer_records) ? data.rabies_titer_records : []
  return readTiterEntries({ data } as Parameters<typeof readTiterEntries>[0]).filter((entry) => {
    const record = raw[entry.originalIndex] as Record<string, unknown> | null
    const value = numericResult(record?.value)
    return isJapanTiterLabApproved(record?.lab) && (value === null || value >= 0.5)
      && (!confirmedOnly || isJapanTiterResultConfirmed(data, entry))
  })
}

/** Result confirmation belongs to this record, never a result at an unapproved lab. */
export function isJapanTiterResultConfirmed(data: Record<string, unknown>, entry: TiterEntry): boolean {
  const value = numericResult(entry.value)
  if (value !== null) return value >= 0.5
  if (typeof entry.value === 'string' && entry.value.trim()) return false
  if (entry.originalIndex === 0) return data.rabies_titer_result_confirmed === true
  const latestExtra = readTiterEntries({ data } as Parameters<typeof readTiterEntries>[0])
    .filter((t) => t.originalIndex > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return latestExtra?.originalIndex === entry.originalIndex && data.titer_extra_result_confirmed === true
}
