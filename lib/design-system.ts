/**
 * PetMove Design System
 *
 * 홈화면(고객리스트)의 디자인 스타일을 기준으로 모든 페이지에 일관되게 적용합니다.
 *
 * ═══════════════════════════════════════════════════════════════════
 * 홈화면 (고객리스트) 디자인 스타일 정의
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. 페이지 레이아웃:
 *    - 외부 컨테이너: h-full overflow-hidden px-lg py-10
 *    - 내부 컨테이너: h-full mx-auto max-w-5xl
 *    - 반응형: 2xl:px-xl, 3xl:px-2xl, 4xl:px-3xl
 *              3xl:max-w-6xl, 4xl:max-w-7xl
 *
 * 2. 카드 컨테이너:
 *    - rounded-xl border border-border/60 bg-card p-md shadow-sm
 *
 * 3. 리스트 아이템/필드 행:
 *    - px-md py-2.5
 *    - border-b border-border/60 last:border-b-0
 *    - transition-colors
 *    - hover:bg-muted/60
 *
 * 4. 글씨 크기:
 *    - text-base (16px): 기본 텍스트, 필드 값, 필드 라벨
 *    - text-[15px]: 검색창
 *    - text-sm (14px): 보조 텍스트
 *    - text-xs (12px): 배지, 태그, 카운트
 *    - text-[13px]: 추가 정보 (마이크로칩 등)
 *
 * 5. 입력 필드:
 *    - h-10 px-3 text-[15px] bg-card
 *    - border border-border rounded-md
 *
 * 6. 버튼:
 *    - h-10 w-10 (icon button)
 *    - border border-border bg-card
 *    - hover:bg-accent transition-colors
 *
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── Layout ────────────────────────────────────────────────────
/** 페이지 외부 컨테이너 (h-full overflow-hidden + padding) */
export const pageContainer =
  'h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl'

/** 페이지 내부 컨테이너 (mx-auto max-width) */
export const pageInnerContainer =
  'h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl'

// ─── Card ──────────────────────────────────────────────────────
/** 카드 컨테이너 - 페이지의 메인 콘텐츠 영역 */
export const cardContainer =
  'rounded-xl border border-border/60 bg-card p-md shadow-sm'

// ─── List Item ─────────────────────────────────────────────────
/** 리스트 아이템/필드 행 스타일 */
export const listItem =
  'px-md py-2.5 border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/60'

// ─── Text Sizes ────────────────────────────────────────────────
export const textBase = 'text-base'       // 16px - 기본
export const textSearch = 'text-[15px]'   // 15px - 검색창
export const textSm = 'text-sm'           // 14px - 보조
export const textXs = 'text-xs'           // 12px - 배지
export const textSecondary = 'text-[13px]' // 13px - 추가 정보

// ─── Input/Button ──────────────────────────────────────────────
export const inputField =
  'h-10 px-3 text-[15px] bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring'

export const iconButton =
  'h-10 w-10 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'

// ─── Tabs ──────────────────────────────────────────────────────
/** 탭 컨테이너 */
export const tabContainer = 'flex gap-xs mb-6 border-b border-border'

/** 탭 버튼 (활성화/비활성화 상태에 따라 추가 클래스 필요) */
export const tabButton =
  'px-md py-2 text-base font-medium transition-colors border-b-2 -mb-px'
