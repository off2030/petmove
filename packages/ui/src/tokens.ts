/**
 * 인라인 스타일 토큰 — 컴포넌트로 추출하지 않고 className 으로 직접 합성하는 패턴.
 *
 * 컴포넌트는 `cn(iconButton, '...')` 형태로 부분 override.
 */

// 카드 컨테이너 — 테두리/음영 없음, bg-card == bg-background
export const cardContainer =
  'rounded-xl bg-card p-md'

// 둥근 아이콘 버튼 (date-text-field 의 trailing icon 등에 사용)
export const iconButton =
  'h-10 w-10 inline-flex items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
