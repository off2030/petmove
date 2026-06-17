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
