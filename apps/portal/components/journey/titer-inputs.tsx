'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 광견병 항체가 검사 step 입력 필드 — 채혈일 + 검사결과. controlled — 부모
 * (step-detail-view)가 state·save 를 보유. 저장 형식은 case.data.rabies_titer_records[0]
 * 의 date / value (펫무브워크 RabiesTiterField 와 동일 키, 값엔 IU/mL 단위 미포함).
 */

export interface TiterForm {
  date: string
  value: string
}

export function TiterInputs({
  form,
  onChange,
}: {
  form: TiterForm
  onChange: (key: keyof TiterForm, next: string) => void
}) {
  const C = {
    surface: '#FBF7F1',
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
    ink2: '#6B6457',
  } as const

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
  }

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
        <div style={labelStyle}>채혈일</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={form.date}
            onChange={(v) => onChange('date', v)}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </div>
      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사결과</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            inputMode="decimal"
            value={form.value}
            onChange={(e) => onChange('value', e.target.value)}
            placeholder="예: 0.5"
            style={inputStyle}
          />
          <span style={{ fontSize: 14, color: C.ink2, flexShrink: 0 }}>IU/mL</span>
        </div>
      </div>
    </div>
  )
}
