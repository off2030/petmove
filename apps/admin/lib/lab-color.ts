/**
 * 검사기관(lab) 칩 — 중립 단색 (2026-08-05 사용자 확정).
 *
 * 예전엔 기관별 8-tone(--pmw-chip-*) 매핑이었으나, 라벨(명사)에 색을 쓰면 상태색
 * (진행·완료·경고) 신호가 묻히고 brand 스킨에서 튀어 무채로 통일했다. 기관 구분은
 * 텍스트가 담당. neutral 토큰은 스킨별로 정의되어 자동 분기.
 * (같은 이유로 여행지 칩 색 매핑(destination-color.ts)은 삭제 — 애초에 미사용이었다.)
 */
const NEUTRAL = {
  bg: 'bg-pmw-chip-neutral',
  text: 'text-pmw-chip-neutral-foreground',
} as const

export type LabColor = typeof NEUTRAL

export function labColor(lab: string | null | undefined): LabColor | null {
  if (!lab) return null
  return NEUTRAL
}
