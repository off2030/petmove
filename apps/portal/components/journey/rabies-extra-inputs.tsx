'use client'

import { DateTextField } from '@petmove/ui'
import type { RabiesEntryForm, RabiesProductHints } from './rabies-entry-inputs'

/**
 * 광견병 추가 백신(3차 이상) step 입력 — 가변 길이 배열 + 추가/삭제.
 *
 * 1·2차 (RabiesEntryInputs) 와 필드 구성은 동일하지만, 추가 접종은 차수가 정해져 있지
 * 않아 사용자가 카드를 추가/삭제할 수 있다. 각 카드 헤더에 "광견병 N차" + 삭제 아이콘,
 * 마지막에 + 버튼.
 *
 * 본병원/타병원 약품칸 규칙은 1·2차와 같음 — 본병원이면 '병원 지정' 카탈로그 hint 를
 * 읽기 전용으로, 타병원이면 직접 입력. other_hospital 토글은 펫무브워크 전용이라
 * 포털은 entry 의 other_hospital 값을 그대로 보여주기만 한다.
 */

export interface RabiesExtraEntry extends RabiesEntryForm {
  /** 펫무브워크가 설정한 타병원 접종 여부. portal 은 토글 X — 표시만 사용. 신규 카드는 true. */
  other_hospital: boolean
}

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  warn: '#C26A4A',
} as const

const FIELDS: ReadonlyArray<{
  key: keyof RabiesEntryForm
  label: string
  kind: 'date' | 'text' | 'years'
  required?: boolean
  placeholder?: string
}> = [
  { key: 'date', label: '접종일', kind: 'date', required: true },
  { key: 'valid_until', label: '면역 유효기간', kind: 'years' },
  { key: 'product', label: '약품명', kind: 'text', placeholder: '예: Rabisin' },
  { key: 'manufacturer', label: '제조사', kind: 'text', placeholder: '예: Boehringer Ingelheim' },
  { key: 'lot', label: '제조번호', kind: 'text', placeholder: '예: G98321' },
  { key: 'expiry', label: '제품 유효기간', kind: 'date' },
]

function selectedYear(value: string): string | null {
  const m = value.match(/^(\d+)\s*년$/)
  if (m) return m[1]
  if (value.trim() === '') return '1'
  return null
}

function hintForKey(
  key: keyof RabiesEntryForm,
  hints: RabiesProductHints | null | undefined,
): string | undefined {
  if (!hints) return undefined
  if (key === 'product' || key === 'manufacturer' || key === 'lot' || key === 'expiry') {
    return hints[key]
  }
  return undefined
}

export function RabiesExtraInputs({
  entries,
  onChange,
  onRemove,
  onAdd,
  productHintsFor,
}: {
  entries: RabiesExtraEntry[]
  onChange: (index: number, key: keyof RabiesEntryForm, next: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
  /** 각 entry 의 접종일 기준 카탈로그 자동 추론 — 본병원일 때 약품 4필드에 읽기 전용 표시. */
  productHintsFor: (index: number) => RabiesProductHints | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((entry, i) => (
        <ExtraCard
          key={i}
          entry={entry}
          doseNumber={i + 3}
          onChange={(key, next) => onChange(i, key, next)}
          onRemove={() => onRemove(i)}
          productHints={productHintsFor(i)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginTop: 4,
          padding: '12px 0',
          borderRadius: 14,
          border: `1px dashed ${C.line}`,
          background: 'transparent',
          color: C.ink2,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + 접종 기록 추가
      </button>
    </div>
  )
}

function ExtraCard({
  entry,
  doseNumber,
  onChange,
  onRemove,
  productHints,
}: {
  entry: RabiesExtraEntry
  doseNumber: number
  onChange: (key: keyof RabiesEntryForm, next: string) => void
  onRemove: () => void
  productHints: RabiesProductHints | null
}) {
  const otherHospital = entry.other_hospital !== false

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
  const designatedStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'rgba(42,38,32,0.035)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink2,
    boxSizing: 'border-box',
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          padding: '12px 0 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>광견병 {doseNumber}차</div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="삭제"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 0,
            background: 'transparent',
            color: C.ink3,
            cursor: 'pointer',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>
      {FIELDS.map((field) => {
        const isProduct =
          field.key === 'product' ||
          field.key === 'manufacturer' ||
          field.key === 'lot' ||
          field.key === 'expiry'
        const designated = isProduct && !otherHospital
        const hint = designated ? hintForKey(field.key, productHints) : undefined
        return (
          <div
            key={field.key}
            style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}
          >
            <div style={labelStyle}>
              {field.label}
              {field.required && <span style={{ color: C.warn, marginLeft: 4 }}>*</span>}
              {designated && (
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: C.ink3 }}>
                  병원 지정
                </span>
              )}
            </div>
            {field.kind === 'years' ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                {(['1', '2', '3'] as const).map((n) => {
                  const selected = selectedYear(entry[field.key]) === n
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onChange(field.key, `${n}년`)}
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        borderRadius: 10,
                        border: `1px solid ${selected ? C.ink : C.line}`,
                        background: selected ? C.ink : '#fff',
                        color: selected ? C.surface : C.ink2,
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background .12s, color .12s, border-color .12s',
                      }}
                    >
                      {n}년
                    </button>
                  )
                })}
              </div>
            ) : designated ? (
              <div style={designatedStyle}>
                {hint || <span style={{ color: C.ink3 }}>—</span>}
              </div>
            ) : field.kind === 'date' ? (
              <div style={{ marginTop: 8 }}>
                <DateTextField
                  value={entry[field.key]}
                  onChange={(v) => onChange(field.key, v)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            ) : (
              <input
                type="text"
                value={entry[field.key]}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
