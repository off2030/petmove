'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'

/**
 * 나라별 도착 수입검역 step 입력 — 검역일 1개(일본 외). 날짜 박스는 구조라 공통이지만, 부제
 * 문구(subtitle)는 그 나라 override(input.helpText)에서 받아 나라별로 다르다. controlled —
 * 부모(step-detail-view)가 state·save·저장 필드 key 를 보유. 일본은 JpImportQuarantineInputs 별도.
 */
export function ImportQuarantineInputs({
  date,
  onChange,
  subtitle,
  label = '검역일',
}: {
  date: string
  onChange: (next: string) => void
  subtitle: string
  /** 날짜 필드 라벨 — 검역 '검역일', EU 입국 '검사일', 증명서 '발급일', 사전 통지 '통지일'. */
  label?: string
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
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{label}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{subtitle}</div>
        )}
        <div style={{ marginTop: 8 }}>
          <DateTextField value={date} onChange={onChange} placeholder="YYYY-MM-DD" block />
        </div>
      </div>
    </div>
  )
}
