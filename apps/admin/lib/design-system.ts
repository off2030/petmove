/**
 * PetMove Design System — Editorial 톤
 *
 * 공용 패턴은 components/ui/* 컴포넌트(PillButton, ListRow, SectionLabel,
 * PageShell 등)로 이전됨. 여기는 컴포넌트화하지 않은 인라인 클래스 두 개만 남김.
 */

// 카드 컨테이너 — 테두리/음영 없음, bg-card == bg-background
export const cardContainer =
  'rounded-xl bg-card p-md'

// 둥근 아이콘 버튼 (date-text-field 의 trailing icon 등에 사용)
export const iconButton =
  'h-10 w-10 inline-flex items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
