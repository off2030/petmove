/**
 * 펫무브 디자인 스케일 — 둥글기·글꼴·간격. (색은 ./palette 의 C 참조.)
 *
 * 화면마다 매직 넘버를 박지 말고 이걸 import 해서 쓴다:
 *   import { RADIUS } from '@/lib/tokens'
 *   borderRadius: RADIUS.card
 *
 * 값은 기존 화면들이 사실상 따르던 스케일을 명문화한 것(2026-06-17).
 * 문서: docs/portal-design-tokens.md
 */

/** 둥글기(px) — 컴포넌트 유형별. */
export const RADIUS = {
  /** 알약·원형 — 칩, 아바타, 하단 nav 탭. */
  pill: 999,
  /** 바텀시트·플로팅 바. */
  sheet: 22,
  /** 바깥 카드 — 페이지/편집 카드, step 카드, 서류 상세. */
  card: 18,
  /** 안쪽 입력 카드 — 여정 입력 그룹, 정보 행 묶음. */
  inner: 16,
  /** 버튼 — 저장 등 주요 액션. */
  button: 14,
  /** 입력칸·작은 박스. */
  field: 10,
  /** 작은 요소 — 점·배지·체크박스. */
  chip: 6,
} as const

/** 글꼴 크기(px) — 본문 계열. 제목(serif)은 헤딩 단계라 인라인 유지(h1 28·이름 20·hero 18). */
export const TEXT = {
  /** mono-cap 라벨(대문자 트래킹). */
  cap: 11,
  /** 메타·보조 텍스트. */
  meta: 12,
  /** 본문·필드 라벨. */
  body: 13,
  /** 버튼 라벨. */
  button: 14,
  /** 입력값. */
  input: 15,
} as const

/** 간격(px). */
export const SPACE = {
  /** 페이지 좌우 패딩. */
  page: 24,
  /** 바깥 카드 패딩. */
  card: 18,
} as const

/** 탭 루트 리듬 — 상단 바 아래 → 제목 시작 공백. 준비·서류·맡기기·내 정보·더보기·내 여정
 *  전 탭 공통 (2026-07-13 통일 — 탭마다 24/32/40/44 로 제각각이던 것을 박제).
 *  탭 루트 컨테이너는 paddingTop 에 이 값만 쓰고, 제목엔 위 마진을 주지 않는다. */
export const PAGE_TOP = 32

/**
 * 타이포 위계 — 앱 전체 단일 출처 (2026-07-13 통일).
 * 3단 제목 + 라벨. 촘촘하던 24/20/18/17 을 24 → 17 → 16 으로 벌리고, 라벨은 하나로.
 * 화면 코드는 여기서 import 해서 쓰고 fontSize/weight/color 를 직접 박지 말 것.
 *
 *   pageTitle   24/600  화면 제목 — 탭 루트·동물 이름·하위 페이지 제목
 *   sectionTitle 17/600 구획 제목 — 준비 단계·서류 체크리스트·검역증·보관함
 *   itemTitle   16/500  항목 제목 — 카드 이름(동물·조직)·리스트 행 이름
 *   groupLabel  12/600  라벨(ink3) — 보호자·알림·일본으로 떠나요 등 회색 소제목
 */
export const pageTitle = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 600,
  fontSize: 24,
  letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.15,
  margin: 0,
  color: 'var(--pm-ink)',
} as const

/** 구획 제목 — 화면을 큰 덩어리로 나누는 제목. 17/600 잉크. margin 은 호출자가. */
export const sectionTitle = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 600,
  fontSize: 17,
  letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--pm-ink)',
} as const

/** 항목 제목 — 카드/행 안의 이름. 16/500 잉크. */
export const itemTitle = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  fontSize: 16,
  color: 'var(--pm-ink)',
} as const

/** 라벨 — 회색 소제목(구획 라벨·구간 캡션). 12/600 ink3. settings-shared 의 monoCap 과 동일. */
export const groupLabel = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--pm-ink-3)',
} as const
