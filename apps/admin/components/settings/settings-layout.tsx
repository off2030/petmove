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

/** 페이지 컨테이너 — max-width + 하단 padding. 모든 설정 섹션의 최외곽. */
export function SettingsShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('max-w-3xl pb-2xl', className)}>{children}</div>
}

/**
 * 섹션 — 헤더(h2 + description) + 본문 슬롯.
 * 한 섹션 안에 여러 SettingsRow 가 들어감.
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
    <section className={cn('pb-xl', className)}>
      <header className="pb-md">
        <SectionHeader>{title}</SectionHeader>
        {description ? <p className="pmw-st__sec-lead mt-2">{description}</p> : null}
      </header>
      <div className="space-y-md">{children}</div>
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
 * 설정 화면 전용 small-cap 라벨 (mono / uppercase 톤).
 * 짧은 영어 카테고리 라벨에 사용 — `Account` / `Organization` / `Messaging` 등.
 * `cases/*` 의 `ui/section-label.tsx`(12px / 1.3px) 와는 별개.
 */
export function SettingsSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2', className)}>
      <span className="font-mono text-[11px] tracking-[1.8px] uppercase text-muted-foreground/70">
        {children}
      </span>
    </div>
  )
}

/**
 * 설정 화면 전용 serif 라벨.
 * 한국어 그룹 헤더에 사용 — `기본 증명서` / `검사기관` 등.
 * mono 라벨과 달리 uppercase·tracking 없이 본문 톤에 가까움.
 */
export function SettingsSectionLabelSerif({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-2', className)}>
      <span className="font-serif text-[13px] text-muted-foreground/80">
        {children}
      </span>
    </div>
  )
}

/** 저장/취소 버튼 영역. 보통 섹션 하단 또는 SettingsShell 하단. */
export function SettingsFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <footer className={cn('mt-lg flex items-center justify-end gap-sm', className)}>
      {children}
    </footer>
  )
}
