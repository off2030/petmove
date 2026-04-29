import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 홈 검색창 옆의 둥근 아이콘 버튼 스타일과 동일. 행 우측의 +/클립 버튼 등에 사용.
 * `-my-1` 으로 행 padding 안에 흡수돼 행 높이를 늘리지 않음 (편집 모드 진입 시 줄간격 유지).
 */
export const roundIconBtn =
  'shrink-0 inline-flex h-6 w-6 -my-1 items-center justify-center rounded-full border border-border/80 bg-popover text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50'

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
