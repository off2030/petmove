'use client'

import { cn } from '@/lib/utils'

/**
 * 페이지 셸 — 홈/할일/도구 등 탑레벨 탭의 공통 레이아웃.
 *
 *  ┌─ outer (overflow-hidden, py-10 px-lg ...)
 *  │  ┌─ inner (h-full mx-auto max-w-* flex-col gap-lg)
 *  │  │  ┌─ title (shrink-0)
 *  │  │  ├─ tabs (shrink-0, optional)
 *  │  │  ├─ body (flex-1 min-h-0 overflow-auto)
 *  │  │  └─ footer (shrink-0, optional)
 *
 * 페이지마다 손으로 클래스 맞추던 패턴을 한 군데로.
 */
export function PageShell({
  title,
  titleRight,
  tabs,
  footer,
  maxWidth = '5xl',
  children,
}: {
  title: string
  titleRight?: React.ReactNode
  tabs?: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: '5xl' | '7xl'
  children: React.ReactNode
}) {
  const maxClass =
    maxWidth === '7xl'
      ? 'max-w-7xl'
      : 'max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl'

  return (
    <div className="h-full overflow-hidden px-md md:px-lg py-md md:py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
      <div className={cn('h-full mx-auto flex flex-col gap-md md:gap-lg', maxClass)}>
        <div className="shrink-0 px-sm md:px-lg flex items-baseline justify-between gap-md">
          <h1 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {titleRight}
        </div>
        {tabs}
        <div className="flex-1 min-h-0 overflow-auto scrollbar-minimal">
          {children}
        </div>
        {footer}
      </div>
    </div>
  )
}

/**
 * 페이지 탭 row — PageShell 의 `tabs` prop 에 주입.
 * 좌측 탭 버튼 + 우측 컨트롤 (검색/필터/액션 등).
 */
export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
}: {
  tabs: ReadonlyArray<{ readonly id: T; readonly label: string }>
  value: T
  onChange: (id: T) => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-sm md:gap-md border-b border-border/80 shrink-0 px-sm md:px-lg">
      <div className="flex gap-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-1 py-2 font-serif text-[17px] transition-colors border-b -mb-px',
              value === tab.id
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground/70 hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {right && (
        <div className="flex items-center gap-sm w-full md:w-auto pb-2 md:pb-0 flex-wrap">
          {right}
        </div>
      )}
    </div>
  )
}
