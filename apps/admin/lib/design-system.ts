/**
 * PetMove Design System — Editorial 톤
 *
 * 기본 구조/이름은 그대로 유지하고, 각 시맨틱 클래스 안의 Tailwind 값만
 * 에디토리얼 톤으로 살짝 조정했습니다.
 *   - 페이지 내부 컨테이너 max-w를 조금 좁혀 중앙 컬럼감(에디토리얼)
 *   - 카드 라디우스 xl 유지, 음영 축소
 *   - listItem 의 구분선은 여전히 border-border/60
 *   - 제목/강조에는 font-serif 유틸리티를 병행 사용 (컴포넌트 측에서)
 */

// ─── Layout ────────────────────────────────────────────────────
export const pageContainer =
  'h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl'

// Editorial: 중앙 컬럼을 조금 좁게 (920–1120px)
export const pageInnerContainer =
  'h-full mx-auto max-w-[920px] 3xl:max-w-[1040px] 4xl:max-w-[1120px]'

// ─── Card ──────────────────────────────────────────────────────
// shadow 제거 — 에디토리얼 톤은 ring/border-only
export const cardContainer =
  'rounded-xl border border-border/60 bg-card p-md'

// ─── List Item ─────────────────────────────────────────────────
// 밀도 유지, 호버 톤만 따뜻한 muted
export const listItem =
  'px-md py-3 border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/60'

// ─── Text Sizes ────────────────────────────────────────────────
export const textBase = 'text-base'
export const textSearch = 'text-[15px]'
export const textSm = 'text-sm'
export const textXs = 'text-xs'
export const textSecondary = 'text-[13px]'

// ─── Input/Button ──────────────────────────────────────────────
// bg 를 card 로 유지, rounded 만 full 에 가깝게(에디토리얼 필/필라 검색창 대비)
export const inputField =
  'h-10 px-3 text-[15px] bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring'

export const iconButton =
  'h-10 w-10 inline-flex items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'

// ─── Tabs ──────────────────────────────────────────────────────
export const tabContainer = 'flex gap-xs mb-6 border-b border-border'
export const tabButton =
  'px-md py-2 text-base font-medium transition-colors border-b-2 -mb-px'
