'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 수입 동물검역 step 입력 필드 — 검역일 1개. 일본 + 그 외 나라('departure' override) 공용.
 * 카드 제목이 '[국가] 수입 동물검역'이라 부제엔 나라 수식어를 두지 않는다. controlled —
 * 부모(step-detail-view)가 state·save 보유. 저장 키는 호출부가 결정(일본=jp_import_quarantine_date,
 * 그 외=import_quarantine_date).
 */
export function ImportQuarantineInputs({
  date,
  onChange,
}: {
  date: string
  onChange: (next: string) => void
}) {
  const C = {
    surface: 'var(--pm-surface)',
    line: 'var(--pm-line)',
    ink: 'var(--pm-ink)',
    ink3: 'var(--pm-ink-3)',
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
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>검역일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          공항 동물검역소에서 수입 검역을 받은 날짜
        </div>
        <div style={{ marginTop: 8 }}>
          <DateTextField value={date} onChange={onChange} placeholder="YYYY-MM-DD" block />
        </div>
      </div>
    </div>
  )
}
