'use client'

import { useState } from 'react'
import { DateTextField } from '@petmove/ui'

/**
 * 광견병 항체 검사(2회차+) step 입력 — 가변 길이 배열 + 추가/삭제.
 *
 * 1회차 (TiterInputs) 와 필드 구성은 동일하지만, 추가 검사는 회차가 정해져 있지 않아
 * 사용자가 카드를 추가/삭제할 수 있다. 각 카드 헤더에 "광견병 항체 검사(N차)" + 삭제 아이콘,
 * 마지막에 + 버튼.
 *
 * 저장 형식은 case.data.rabies_titer_records[index] (index >= 1) — 펫무브워크
 * RabiesTiterField 와 동일 키. value 는 IU/mL 없이 수치만 (server action 이 단위 제거).
 */

export interface TiterExtraEntry {
  date: string
  lab: string
  value: string
}

const C = {
  surface: 'var(--pm-surface)',
  line: 'var(--pm-line)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  accent: 'var(--pm-accent)',
  accentSoft: 'rgba(184,153,104,.14)',
} as const

const CUSTOM_LAB = '__custom__'

const LAB_OPTIONS = [
  { value: 'apqa_seoul', label: '농림축산검역본부 (APQA)' },
  { value: 'ksvdl_r', label: 'Kansas State Rabies Laboratory' },
  { value: CUSTOM_LAB, label: '직접 입력' },
]

const LAB_CODES = LAB_OPTIONS.filter((o) => o.value !== CUSTOM_LAB).map((o) => o.value)

export function TiterExtraInputs({
  entries,
  onChange,
  onRemove,
  onAdd,
}: {
  entries: TiterExtraEntry[]
  onChange: (index: number, key: keyof TiterExtraEntry, next: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((entry, i) => (
        <ExtraCard
          key={i}
          entry={entry}
          roundNumber={i + 2}
          onChange={(key, next) => onChange(i, key, next)}
          onRemove={() => onRemove(i)}
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
        + 검사 기록 추가
      </button>
    </div>
  )
}

function ExtraCard({
  entry,
  roundNumber,
  onChange,
  onRemove,
}: {
  entry: TiterExtraEntry
  roundNumber: number
  onChange: (key: keyof TiterExtraEntry, next: string) => void
  onRemove: () => void
}) {
  // 검사기관 — 코드 목록에 없으면 직접 입력 모드. 사용자가 방금 '직접 입력' 선택했지만
  // 아직 미입력인 경우(form.lab === '') 도 같은 모드. (TiterInputs 와 동일 로직.)
  const [pickedCustom, setPickedCustom] = useState(false)
  const isCustomStored = entry.lab !== '' && !LAB_CODES.includes(entry.lab)
  const customMode = isCustomStored || (pickedCustom && entry.lab === '')
  const selectedLab = customMode ? CUSTOM_LAB : entry.lab

  function handleLabSelect(next: string) {
    if (next === CUSTOM_LAB) {
      setPickedCustom(true)
      if (LAB_CODES.includes(entry.lab)) onChange('lab', '')
    } else {
      setPickedCustom(false)
      onChange('lab', next)
    }
  }

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
  const fieldBox: React.CSSProperties = {
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
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
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
          광견병 항체 검사({roundNumber}차)
        </div>
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

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>채혈일</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={entry.date}
            onChange={(v) => onChange('date', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사기관</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LAB_OPTIONS.map((o) => {
            const selected = selectedLab === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => handleLabSelect(o.value)}
                aria-pressed={selected}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '11px 12px',
                  border: `1px solid ${selected ? C.accent : C.line}`,
                  borderRadius: 10,
                  background: selected ? C.accentSoft : 'var(--pm-surface)',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  color: C.ink,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color .12s, background .12s',
                }}
              >
                <span>{o.label}</span>
                {selected && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.accent}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
        {customMode && (
          <input
            type="text"
            value={entry.lab}
            onChange={(e) => onChange('lab', e.target.value)}
            placeholder="검사기관명을 입력하세요"
            style={{ ...fieldBox, marginTop: 8, width: '100%' }}
          />
        )}
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사결과</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            inputMode="decimal"
            value={entry.value}
            onChange={(e) => onChange('value', e.target.value)}
            placeholder="예: 0.5"
            style={{ ...fieldBox, flex: 1, minWidth: 0 }}
          />
          <span style={{ fontSize: 14, color: C.ink2, flexShrink: 0 }}>IU/mL</span>
        </div>
      </div>
    </div>
  )
}
