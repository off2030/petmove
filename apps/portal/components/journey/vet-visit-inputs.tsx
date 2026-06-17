'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'

/**
 * 내원·임상검진 step 입력 필드 — 검진일 1개. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data.vet_visit_date (YYYY-MM-DD).
 */
export function VetVisitInputs({
  date,
  onChange,
}: {
  date: string
  onChange: (next: string) => void
}) {

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
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>검진일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          임상 수의사의 검진을 받은 날짜
        </div>
        <div style={{ marginTop: 8 }}>
          <DateTextField value={date} onChange={onChange} placeholder="YYYY-MM-DD" block />
        </div>
      </div>
    </div>
  )
}
