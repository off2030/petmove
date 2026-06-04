'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 마이크로칩 step 입력 필드(번호 + 삽입일). controlled — 부모(step-detail-view)가
 * state 와 save 로직을 보유. 이 컴포넌트는 mask/위젯만 렌더.
 *
 * - 칩 번호: raw 15-digit store, 3자리 공백 구분 display (apply/page.tsx 와 동일 mask).
 * - 삽입일: @petmove/ui 의 DateTextField (apply 와 동일 컴포넌트).
 */
export function MicrochipInputs({
  chip,
  date,
  onChipChange,
  onDateChange,
}: {
  chip: string
  date: string
  onChipChange: (next: string) => void
  onDateChange: (next: string) => void
}) {
  const C = {
    surface: 'var(--pm-surface)',
    line: 'var(--pm-line)',
    ink: 'var(--pm-ink)',
    ink3: 'var(--pm-ink-3)',
  } as const

  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const fieldStyle: React.CSSProperties = {
    padding: '14px 0',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const helpStyle: React.CSSProperties = {
    fontSize: 12,
    color: C.ink3,
    marginTop: 2,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
  }

  const chipDisplay = chip.replace(/(\d{3})(?=\d)/g, '$1 ')

  return (
    <div style={cardStyle}>
      <div style={fieldStyle}>
        <div style={labelStyle}>마이크로칩 번호</div>
        <div style={helpStyle}>000 000 000 000 000 형식 (3자리씩 공백 구분)</div>
        <input
          type="text"
          inputMode="numeric"
          value={chipDisplay}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 15)
            onChipChange(digits)
          }}
          placeholder="000 000 000 000 000"
          maxLength={19}
          style={inputStyle}
        />
      </div>
      <div style={{ ...fieldStyle, borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>삽입일</div>
        <div style={helpStyle}>달력에서 선택하거나 YYYY-MM-DD 로 입력하세요.</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={date}
            onChange={(v) => onDateChange(v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>
    </div>
  )
}
