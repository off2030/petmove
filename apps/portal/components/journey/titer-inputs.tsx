'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 광견병 항체가 검사 step 입력 필드 — 채혈일 1개. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data.rabies_titer_records[0].date.
 */
export function TiterInputs({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const C = {
    surface: '#FBF7F1',
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
  } as const

  return (
    <div
      style={{
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 16,
        padding: '4px 16px',
      }}
    >
      <div style={{ padding: '14px 0' }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>채혈일</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField value={value} onChange={onChange} placeholder="YYYY-MM-DD" />
        </div>
      </div>
    </div>
  )
}
