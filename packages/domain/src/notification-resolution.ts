import { getJapanTiterLabStatus } from './journey-steps/japan-titer'

export const JAPAN_TITER_LAB_WARNING = '입력된 검사기관이 일본 지정기관으로 확인되지 않아요. 검사 결과지의 기관명과 입력값을 대조해 주세요.'
const LEGACY_JAPAN_TITER_LAB_WARNING = '일본 지정기관의 항체검사가 필요해요. APQA Seoul·KSVDL-R·RIAS 등 지정기관을 확인하세요. 기존 기록의 기관명만 바꾸면 안 돼요.'

export interface NotificationResolution {
  resolved: boolean
  resolvedBulletIndexes: number[]
}

function labWarningBulletIndexes(content: string): { bullets: string[]; indexes: number[]; truncated: boolean } {
  const lines = content.trim().split('\n').map((line) => line.trim())
  if (!/^검증 실패 알림(?: \(\d+건\))?$/.test(lines[0])) return { bullets: [], indexes: [], truncated: false }
  const bullets = lines.filter((line) => line.startsWith('•')).map((line) => line.replace(/^•\s*/, ''))
  const indexes = bullets.flatMap((bullet, index) =>
    bullet === JAPAN_TITER_LAB_WARNING || bullet === LEGACY_JAPAN_TITER_LAB_WARNING ? [index] : [])
  return { bullets, indexes, truncated: lines.some((line) => /^외 \d+건/.test(line)) }
}

export function isJapanTiterLabNotification(content: string): boolean {
  return labWarningBulletIndexes(content).indexes.length > 0
}

/** Resolve only identifiable lab warnings from current saved data; never infer other warnings are fixed. */
export function resolveJapanTiterLabNotification(
  content: string,
  data: Record<string, unknown> | null | undefined,
): NotificationResolution | undefined {
  const { bullets, indexes, truncated } = labWarningBulletIndexes(content)
  if (!indexes.length || !data || getJapanTiterLabStatus(data) !== 'approved') return undefined
  return { resolved: !truncated && indexes.length === bullets.length, resolvedBulletIndexes: indexes }
}
