'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'

/**
 * 한국 수출 동물검역 step 입력 필드 — 검역일 1개. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data.kr_export_quarantine_date (YYYY-MM-DD).
 */
export function KrExportQuarantineInputs({
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
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>검역일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          동물검역소에서 수출 검역을 받은 날짜
        </div>
        <div style={{ marginTop: 8 }}>
          <DateTextField value={date} onChange={onChange} placeholder="YYYY-MM-DD" block />
        </div>
      </div>
    </div>
  )
}
