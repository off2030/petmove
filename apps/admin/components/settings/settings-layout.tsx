'use client'

import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import { SectionHeader } from '@petmove/ui'
import { Check, Search, X } from 'lucide-react'

/**
 * 설정 화면 공통 골격. 점진 마이그레이션용 — 일단 export 만 두고
 * 각 섹션이 자체 레이아웃을 들고 있는 현재 구조에서 한 곳씩 갈아끼움.
 *
 * 표준 사용 패턴:
 *   <SettingsShell>
 *     <SettingsSection title="…" description="…">
 *       <SettingsRow title="…" description="…">…</SettingsRow>
 *       <SettingsRow …>…</SettingsRow>
 *     </SettingsSection>
 *     <SettingsFooter>…</SettingsFooter>
 *   </SettingsShell>
 */

/**
 * 페이지 컨테이너 — max-width + 하단 padding. 모든 설정 섹션의 최외곽.
 * - `md` (default, 3xl): profile / company / members / DataSection 등 폼 위주.
 * - `lg` (5xl): inspection / import_report / export_doc / automation / verification 등
 *   다중 여행지 칩 / 테이블·리스트가 들어가는 섹션.
 * 4xl(detail-view) 같은 중간 폭은 `className="max-w-4xl"` 로 override.
 */
export function SettingsShell({
  children,
  size = 'md',
  className,
}: {
  children: React.ReactNode
  size?: 'md' | 'lg'
  className?: string
}) {
  const widthCls = size === 'lg' ? 'max-w-5xl' : 'max-w-3xl'
  return <div className={cn(widthCls, 'pb-2xl', className)}>{children}</div>
}

/**
 * 섹션 — 헤더(h2 + description) + 본문 슬롯.
 * 본문은 card-list / dotted-list / mixed 등 각 페이지의 row 패턴이 달라
 * 자체 spacing wrapper 를 두지 않음. 필요하면 children 측에서 `space-y-md` 등을 부여.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <header className="pb-xl">
        <SectionHeader>{title}</SectionHeader>
        {description ? <p className="pmw-st__sec-lead mt-2">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

export function SettingsSearchInput({
  value,
  onChange,
  placeholder = '검색',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          SETTINGS_SIZE.lg.control,
          'w-full pl-10 pr-9 bg-popover text-foreground shadow-none border border-border/80 rounded-full focus-visible:outline-none focus-visible:ring-0 focus-visible:border-foreground/40 placeholder:text-muted-foreground/60',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/* ── 크기 규격 ────────────────────────────────────────────────────────────
 *
 * 설정 화면의 컨트롤·칩은 세 단만 쓴다.
 *
 *   lg — 44px / 15px : 화면 상단 검색 줄 (검색창과 그 옆에 붙는 버튼·필터)
 *   md — 32px / 13px : 카드·페이지 단위 액션 (저장, 필터, 툴바 버튼, 폼 드롭다운)
 *   sm — 22px / 12px : 글과 나란히 서는 것 (칩·배지, 행 오른쪽 작은 버튼)
 *
 * 모양은 역할로 갈린다 — **누르는 것은 알약(rounded-full·serif)**, **데이터 태그는
 * 각진 것(rounded-sm·sans)**. 여행지·증명서 칩이 이미 각진 모양이라 그쪽에 맞췄다.
 *
 * **부품이 크기를 스스로 정하지 않는다.** 한 무리(행 오른쪽 묶음, 카드 푸터 등)를
 * 감싸는 `SettingsControlGroup` 이 크기를 한 번 선언하고 안쪽 부품이 물려받는다.
 * 크기를 고르는 판단이 호출처마다 반복되니 한 줄에 22px 과 32px 이 섞이는 일이
 * 계속 생겼다(2026-08-06 멤버 화면) — 그 판단 자체를 없앤 구조다.
 *
 * 설정 폴더에서 크기 클래스(h-8·text-[13px] 등)를 직접 쓰면 `pnpm lint` 가 잡는다.
 * (scripts/lint-settings-size.mjs)
 */

export type SettingsSize = 'sm' | 'md' | 'lg'

/** 크기별 치수 — 알약형 컨트롤·칩 공통. */
export const SETTINGS_SIZE: Record<SettingsSize, { control: string; icon: string }> = {
  sm: { control: 'h-[22px] gap-1 px-2.5 text-[12px]', icon: 'h-2.5 w-2.5' },
  md: { control: 'h-8 gap-1.5 px-3 text-[13px]', icon: 'h-3 w-3' },
  lg: { control: 'h-11 gap-2 px-4 text-[15px]', icon: 'h-4 w-4' },
}

/** 누르는 것 — 알약. */
const PILL_BASE =
  'inline-flex items-center justify-center rounded-full font-serif whitespace-nowrap transition-colors'

/** 데이터 태그 — 각진 것. */
const CHIP_BASE =
  'inline-flex items-center rounded-sm font-sans whitespace-nowrap transition-colors'

const ACTION_TONE =
  'border border-border/80 bg-card text-foreground hover:border-foreground/40 hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * 외부 부품(AttachButton 등)에 넘길 때만 쓰는 md 액션 버튼 클래스.
 * 설정 안에서는 `SettingsActionButton` 을 쓸 것 — 크기를 물려받는다.
 */
export const SETTINGS_ACTION_BUTTON_CLASS = cn(PILL_BASE, SETTINGS_SIZE.md.control, ACTION_TONE)

/**
 * 테두리 있는 입력·선택 컨트롤(모달 안 텍스트 입력, 전체 폭 드롭다운 등).
 * 알약형 컨트롤보다 한 단 크다(36px) — 글자를 넣는 칸이라 세로 여백이 더 필요하다.
 */
export const SETTINGS_BOXED_INPUT_CLASS =
  'h-9 w-full rounded-md border border-border/80 bg-background px-2 font-serif text-[14px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 disabled:opacity-50'

const SettingsSizeContext = createContext<SettingsSize>('md')

/** 감싸인 부품이 물려받을 크기. 무리 밖에서 쓰면 md. */
export function useSettingsSize(): SettingsSize {
  return useContext(SettingsSizeContext)
}

/**
 * 한 무리의 크기를 한 번 선언하는 래퍼 — 안쪽 컨트롤·칩이 전부 이 크기를 따른다.
 * 기본 배치는 가로 정렬이고, `wrap` 을 주면 칩 목록처럼 여러 줄로 접힌다.
 */
export function SettingsControlGroup({
  size = 'md',
  wrap,
  children,
  className,
  ref,
}: {
  size?: SettingsSize
  wrap?: boolean
  children: React.ReactNode
  className?: string
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <SettingsSizeContext.Provider value={size}>
      <div ref={ref} className={cn('flex items-center gap-1.5', wrap && 'flex-wrap', className)}>
        {children}
      </div>
    </SettingsSizeContext.Provider>
  )
}

export function SettingsActionButton({
  children,
  className,
  variant = 'default',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** destructive = 평소엔 같은 모습, hover 에서만 빨강. 삭제·제거용. */
  variant?: 'default' | 'destructive'
}) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      className={cn(
        PILL_BASE,
        SETTINGS_SIZE[size].control,
        ACTION_TONE,
        variant === 'destructive' &&
          'text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * 읽기 전용 태그·배지 — 여행지·증명서 칩, 역할 배지 등.
 * `onRemove` 를 주면 끝에 ✕ 가 붙어 다중 선택 칩으로도 쓸 수 있다.
 */
export function SettingsChip({
  tone = 'default',
  onRemove,
  removeLabel,
  children,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** default = 테두리 / primary = 강조 / plain = 테두리 없는 보조 텍스트 */
  tone?: 'default' | 'primary' | 'plain'
  onRemove?: () => void
  removeLabel?: string
  children: React.ReactNode
  draggable?: boolean
}) {
  const size = useSettingsSize()
  return (
    <span
      {...props}
      className={cn(
        CHIP_BASE,
        SETTINGS_SIZE[size].control,
        tone === 'primary' && 'border border-primary/40 bg-primary/5 text-primary/80',
        tone === 'plain' && 'text-muted-foreground/70',
        tone === 'default' && 'border border-border/80 text-foreground',
        onRemove && 'pr-1.5',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          tabIndex={-1}
          className="text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <X className={SETTINGS_SIZE[size].icon} />
        </button>
      )}
    </span>
  )
}

/** 드롭다운 트리거 — 라벨 + ▾. 열림 상태만 호출처가 관리한다. */
export function SettingsSelectTrigger({
  open,
  children,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { open?: boolean }) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        PILL_BASE,
        SETTINGS_SIZE[size].control,
        'border border-border/80 bg-transparent text-foreground hover:bg-muted/40',
        'focus:outline-none focus:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed',
        open && 'border-foreground/40 bg-muted/30',
        className,
      )}
      {...props}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn(
          'text-muted-foreground transition-transform',
          SETTINGS_SIZE[size].icon,
          open && 'rotate-180',
        )}
      >
        <path
          d="M2 4.5l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** 아이콘만 있는 정사각 버튼 — 삭제(휴지통) 등. 가로세로 모두 규격 높이. */
export function SettingsIconButton({
  children,
  className,
  variant = 'default',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'destructive'
}) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors disabled:opacity-40',
        size === 'sm' ? 'h-[22px] w-[22px]' : size === 'lg' ? 'h-11 w-11' : 'h-8 w-8',
        variant === 'destructive'
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-muted/40 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** 점선 테두리 '＋ 추가' 버튼 — 목록 끝에서 항목을 늘리는 진입점. */
export function SettingsAddButton({
  children,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      className={cn(
        PILL_BASE,
        SETTINGS_SIZE[size].control,
        'rounded-sm border border-dashed border-border/80 text-muted-foreground',
        'hover:text-foreground hover:border-foreground/40 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children ?? '＋ 추가'}
    </button>
  )
}

/** 주 액션(저장) — 무리 안에서 유일하게 채워진 버튼. */
export function SettingsSaveButton({
  children,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      className={cn(
        PILL_BASE,
        SETTINGS_SIZE[size].control,
        'bg-foreground text-background hover:bg-foreground/90',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children ?? '저장'}
    </button>
  )
}

export function SettingsToggleButton({
  pressed,
  children,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed: boolean
}) {
  const size = useSettingsSize()
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        PILL_BASE,
        SETTINGS_SIZE[size].control,
        'border shrink-0',
        pressed
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children ?? (pressed ? 'ON' : 'OFF')}
    </button>
  )
}

export function SettingsCheckBox({
  checked,
  className,
}: {
  checked: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-colors',
        checked ? 'border-foreground/60 bg-foreground/5' : 'border-border/80 bg-transparent',
        className,
      )}
    >
      {checked && <Check className="h-3 w-3 text-foreground" strokeWidth={2.5} />}
    </span>
  )
}

/**
 * 단일 설정 행 — 좌측에 title + description, 우측에 컨트롤(children).
 * variant 는 우측 컨트롤 종류를 가리키는 메타데이터 — 현재는 레이아웃에 영향 X.
 * 마이그레이션이 진행되며 variant 별 분기가 필요하면 그때 확장한다.
 *   - toggle: 우측이 on/off 스위치
 *   - input:  우측이 텍스트/숫자 입력
 *   - chips:  우측이 칩 리스트(다중 선택 등)
 *   - static: 우측이 정적 표시(읽기 전용 값/링크 버튼)
 */
export type SettingsRowVariant = 'toggle' | 'input' | 'chips' | 'static'

export function SettingsRow({
  title,
  description,
  variant: _variant = 'static',
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  variant?: SettingsRowVariant
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-md rounded-sm border border-border/80 px-lg py-md',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="font-serif text-[16px] text-foreground">{title}</h3>
        {description ? <p className="pmw-st__sec-lead mt-1">{description}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  )
}

/**
 * 라벨 + 컨트롤 행. profile / company / inspection 등에서 반복되는
 * `grid grid-cols-[150px_1fr] py-3 border-b border-dotted border-border/80` 패턴을 흡수.
 *
 * - `align="baseline"` (default): input/text 행. 라벨이 input baseline 에 정렬됨.
 * - `align="center"`: avatar / 단일 button 행.
 * - `align="start"`: 우측이 wrap chips 등 여러 줄로 늘어나는 행 — 라벨이 첫 줄 top 에 정렬.
 *
 * 컨트롤은 children 슬롯 — 단일 input 부터 (button + status text) 같은
 * 복합 배치까지 전부 호출처에서 자유롭게 구성.
 */
export function SettingsField({
  label,
  align = 'baseline',
  children,
  className,
}: {
  label: React.ReactNode
  align?: 'baseline' | 'center' | 'start'
  children: React.ReactNode
  className?: string
}) {
  const alignCls =
    align === 'center' ? 'items-center'
    : align === 'start' ? 'items-start'
    : 'items-baseline'
  return (
    <div
      className={cn(
        'grid grid-cols-[150px_1fr] gap-md py-3 border-b border-dotted border-border/80',
        alignCls,
        className,
      )}
    >
      <label
        className={cn(
          'font-serif text-[13px] text-muted-foreground leading-none',
          align === 'baseline' && 'pt-0.5',
          align === 'start' && 'pt-1',
        )}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * title + description 좌측 / 컨트롤 우측 의 list-style 행.
 * `grid grid-cols-[1fr_auto] gap-md py-3 border-b border-dotted` 패턴.
 *
 * - SettingsField 와 차이: 좌측이 짧은 라벨이 아니라 title + 긴 description.
 * - SettingsRow (card-style) 와 차이: rounded-card 가 아닌 dotted-list.
 *
 * 토글 / 단일 button 등 짧은 컨트롤을 우측에 두는 detail-view-section 같은
 * "explanation + switch" 패턴에 사용.
 */
export function SettingsListRow({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/80',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-serif text-[15px] text-foreground">{title}</span>
        {description ? (
          <span className="font-serif text-[12px] text-muted-foreground/70">
            {description}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/**
 * sub-section 제목 — settings 안 sub-group 의 한국어 h3.
 * `font-serif text-[18px] text-foreground` 패턴이 detail-view /
 * documents / share-presets / destinations 등 7곳 이상에서 반복.
 *
 * `<SettingsSectionLabel>` (mono uppercase) / `<SettingsSectionLabelSerif>`
 * (작은 serif 13px) 와는 별개의 큰 sub-title.
 */
export function SettingsSubsectionTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3 className={cn('font-serif text-[18px] text-foreground', className)}>
      {children}
    </h3>
  )
}

/**
 * 설정 화면 전용 sub-group 라벨 (L4) — `계정` / `메시지` / `검사기관` 등.
 *
 * 위계:
 *  - L3 SettingsSubsectionTitle (18px h3, 큰 sub-section)
 *  - **L4 SettingsSectionLabelSerif (14px / foreground / medium, 작은 sub-group)**
 *  - L5 SettingsField label (13px / muted-foreground, 행 라벨)
 *
 * 행 라벨(L5) 과 시각 구분이 명확하도록 +1px / foreground color / medium
 * weight + 큰 mb-3 spacing.
 */
export function SettingsSectionLabelSerif({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3', className)}>
      <span className="font-serif text-[14px] font-medium text-foreground">
        {children}
      </span>
    </div>
  )
}

/**
 * 설정 그룹 카드 — "이 박스 = 한 가지 설정 그룹". 제목·설명·본문을 카드 테두리로 묶어
 * 그룹 경계를 명시한다 (2026-08-06 — 선(line) 기반 그룹 구분에서 카드 기반으로 전환).
 * footer(저장 버튼 영역)는 카드 안 마지막에 SettingsFooter 로.
 */
export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-md border border-border/80 bg-card px-lg py-lg', className)}>
      {title ? <SettingsSubsectionTitle className="mb-1">{title}</SettingsSubsectionTitle> : null}
      {description ? <p className="pmw-st__sec-lead mb-3">{description}</p> : null}
      {children}
    </section>
  )
}

/**
 * "자동 저장됨 · N분 전" — 즉시 저장 화면의 저장 시각 표시.
 * profile / company / org-info-form 에 각자 복제돼 있던 것을 공용화 (2026-08-06).
 */
export function formatSavedAgo(date: Date | null): string {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return '자동 저장됨 · 방금 전'
  if (sec < 60) return `자동 저장됨 · ${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `자동 저장됨 · ${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `자동 저장됨 · ${hour}시간 전`
  return `자동 저장됨 · ${date.toLocaleDateString()}`
}

/**
 * 알약 세그먼트 필터/토글 — '전체·활성·비활성' 필터, '병원·운송' 전환 등
 * 소수 옵션 중 하나 선택. 크기는 감싼 무리에서 물려받는다.
 * verification / automation 에 복제돼 있던 StatusFilterPills 를 제네릭으로 공용화.
 */
export function SettingsFilterPills<V extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: ReadonlyArray<{ value: V; label: string }>
  value: V
  onChange: (value: V) => void
  disabled?: boolean
  className?: string
}) {
  const size = useSettingsSize()
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-card p-1',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            PILL_BASE,
            SETTINGS_SIZE[size].control,
            'disabled:opacity-60',
            value === option.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * 저장 상태 / 보조 액션 / reset 버튼 영역. 보통 카드 하단.
 * 본문과 시각적으로 분리되도록 상단 border + pt-md 가 default.
 * 양쪽 정렬이 필요하면 `<SettingsFooter className="justify-between">`.
 *
 * 카드 단위 액션 영역이므로 안쪽 부품은 md(32px)를 물려받는다.
 */
export function SettingsFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <SettingsSizeContext.Provider value="md">
      <footer
        className={cn(
          'flex items-center justify-end gap-sm border-t border-border/80 pt-md',
          className,
        )}
      >
        {children}
      </footer>
    </SettingsSizeContext.Provider>
  )
}
