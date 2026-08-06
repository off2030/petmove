/**
 * 목적지 칩 공용 부품 — 규칙 목록(검사·증명서 등)에서 국가 나열용.
 *
 * documents-section(둥근 알약 serif) 과 inspection-section(각진 sans) 에 같은 이름으로
 * 다르게 복제돼 있던 것을 통일 (2026-08-06). 표준 = 각진 rounded-sm + sans 12px —
 * DestinationPicker 칩·신고 국가 칩과 같은 모양.
 */

export function DestinationPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px] whitespace-nowrap"
      style={{
        borderColor: 'var(--pmw-border-warm)',
        color: 'var(--pmw-near-black)',
      }}
    >
      {name}
    </span>
  )
}

export function OverflowPill({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center rounded-sm border px-2 py-0.5 font-sans text-[12px]"
      style={{
        borderColor: 'var(--pmw-border-warm)',
        color: 'var(--pmw-near-black)',
      }}
    >
      +{count}개국
    </span>
  )
}
