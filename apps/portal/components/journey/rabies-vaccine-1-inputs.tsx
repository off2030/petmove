'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 광견병 백신 1차 step 입력 필드. controlled — 부모(step-detail-view)가 state·save 보유.
 *
 * 날짜 3종(접종일·면역 유효기간·제품 유효기간)은 @petmove/ui 의 DateTextField
 * (apply 신청폼·마이크로칩 step 과 동일 컴포넌트). 약품명·제조사·제조번호는 텍스트 입력.
 * 저장 형식은 case.data.rabies_dates[0] — 키는 펫무브워크 RepeatableDateField 와 동일.
 */

export interface RabiesVaccine1Form {
  date: string
  valid_until: string
  product: string
  manufacturer: string
  lot: string
  expiry: string
}

const FIELDS: ReadonlyArray<{
  key: keyof RabiesVaccine1Form
  label: string
  kind: 'date' | 'text'
  required?: boolean
}> = [
  { key: 'date', label: '접종일', kind: 'date', required: true },
  { key: 'valid_until', label: '면역 유효기간', kind: 'date' },
  { key: 'product', label: '약품명', kind: 'text' },
  { key: 'manufacturer', label: '제조사', kind: 'text' },
  { key: 'lot', label: '제조번호', kind: 'text' },
  { key: 'expiry', label: '제품 유효기간', kind: 'date' },
]

export function RabiesVaccine1Inputs({
  value,
  onChange,
}: {
  value: RabiesVaccine1Form
  onChange: (key: keyof RabiesVaccine1Form, next: string) => void
}) {
  const C = {
    surface: '#FBF7F1',
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
    warn: '#C26A4A',
  } as const

  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
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
    <div style={cardStyle}>
      {FIELDS.map((field, i) => (
        <div
          key={field.key}
          style={{
            padding: '14px 0',
            borderTop: i === 0 ? undefined : `.5px solid ${C.line}`,
          }}
        >
          <div style={labelStyle}>
            {field.label}
            {field.required && <span style={{ color: C.warn, marginLeft: 4 }}>*</span>}
          </div>
          {field.kind === 'date' ? (
            <div style={{ marginTop: 8 }}>
              <DateTextField
                value={value[field.key]}
                onChange={(v) => onChange(field.key, v)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          ) : (
            <input
              type="text"
              value={value[field.key]}
              onChange={(e) => onChange(field.key, e.target.value)}
              style={inputStyle}
            />
          )}
        </div>
      ))}
    </div>
  )
}
