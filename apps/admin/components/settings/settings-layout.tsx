import { cn } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/section-header'

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
 * - `md` (default, 3xl): profile / company / members / transfers / DataSection 등 폼 위주.
 * - `lg` (5xl): inspection / import_report / export_doc / automation / verification 등
 *   다목적지 칩 / 테이블·리스트가 들어가는 섹션.
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
          <span className="font-serif italic text-[12px] text-muted-foreground/70">
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
 * `font-serif text-[18px] text-foreground` 패턴이 transfers / detail-view /
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
 * 저장 상태 / 보조 액션 / reset 버튼 영역. 보통 SettingsShell 하단.
 * 본문과 시각적으로 분리되도록 상단 border + pt-md 가 default.
 * 양쪽 정렬이 필요하면 `<SettingsFooter className="justify-between">`.
 */
export function SettingsFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <footer
      className={cn(
        'flex items-center justify-end gap-sm border-t border-border/80 pt-md',
        className,
      )}
    >
      {children}
    </footer>
  )
}
