import { cn } from '@/lib/utils'

/**
 * Editorial peach 아바타. 멤버/사용자 목록에서 이니셜 표시.
 * muted 변형은 대기 중 초대 등 아직 "확정 안 된" 상태용.
 * 우선순위: imageUrl > bot=true → PMW 워드마크 > 일반 글자 fallback.
 *   봇이라도 슈퍼어드민이 별도 이미지를 업로드했으면 그 이미지를 우선 표시.
 */
export function Avatar({
  label,
  imageUrl,
  muted = false,
  tone = 'clay',
  size = 'md',
  className,
  bot = false,
}: {
  label: string
  imageUrl?: string | null
  muted?: boolean
  tone?: 'clay' | 'sage'
  size?: 'sm' | 'md'
  className?: string
  bot?: boolean
}) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  // 1) 이미지가 있으면 항상 그것을 우선.
  if (imageUrl) {
    return (
      <div
        data-avatar
        className={cn(
          'rounded-full overflow-hidden shrink-0 bg-muted/40',
          dim,
          className,
        )}
      >
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      </div>
    )
  }
  // 2) 봇이고 이미지 없음 → PMW 워드마크 (헤더와 같은 Alonzo bold + brand brown).
  if (bot) {
    const botText = size === 'sm' ? 'text-[8px] tracking-[0.06em]' : 'text-[10px] tracking-[0.08em]'
    return (
      <div
        data-avatar
        className={cn(
          'rounded-full flex items-center justify-center shrink-0 bg-[#A56D54] text-[#F5F4ED]',
          dim,
          className,
        )}
        title="펫무브워크"
      >
        <span
          className={cn('font-bold leading-none', botText)}
          style={{ fontFamily: "'Alonzo', 'Bodoni Moda', 'Playfair Display', Georgia, serif" }}
        >
          PMW
        </span>
      </div>
    )
  }
  // 3) 일반 사용자 fallback — 글자 이니셜.
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[14px]'
  const toneClass = muted
    ? 'bg-muted/60 text-muted-foreground'
    : tone === 'sage'
      ? 'bg-[var(--pmw-sage-soft)] text-[var(--pmw-sage)] dark:text-[var(--pmw-olive-gray)] border border-[var(--pmw-sage)]/30 dark:border-[var(--pmw-stone-gray)]/70'
      : 'bg-pmw-avatar/45 text-pmw-avatar-foreground dark:bg-pmw-avatar/40'
  return (
    <div data-avatar className={cn('rounded-full flex items-center justify-center shrink-0', dim, toneClass, className)}>
      <span className={cn('font-serif', textSize)}>{label}</span>
    </div>
  )
}

export function avatarInitial(s: string): string {
  const trimmed = s.trim()
  if (!trimmed) return '?'
  return Array.from(trimmed)[0] ?? '?'
}
