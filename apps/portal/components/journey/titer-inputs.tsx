'use client'

import { useState } from 'react'
import { DateTextField } from '@petmove/ui'

/**
 * 광견병 항체 검사 step 입력 필드 — 채혈일 + 검사기관 + 검사결과. controlled — 부모
 * (step-detail-view)가 state·save 를 보유. 저장 형식은 case.data.rabies_titer_records[0]
 * 의 date / lab / value (펫무브워크 RabiesTiterField 와 동일 키).
 *  - lab 은 검사기관 코드(apqa_seoul / ksvdl_r), 목록에 없으면 직접 입력한 기관명.
 *  - value 는 IU/mL 단위 없이 수치만 (저장 시 server action 이 단위 제거).
 */

export interface TiterForm {
  date: string
  lab: string
  value: string
}

/** '직접 입력' 옵션 sentinel — form.lab 에 저장되지 않고 목록 표시용으로만 쓰임. */
const CUSTOM_LAB = '__custom__'

/** 검사기관 선택지 — value 는 펫무브워크 LAB_INFO 와 동일 코드, label 은 보호자용 명칭. */
const LAB_OPTIONS = [
  { value: 'apqa_seoul', label: '농림축산검역본부 (APQA)' },
  { value: 'ksvdl_r', label: 'Kansas State Rabies Laboratory' },
  { value: CUSTOM_LAB, label: '직접 입력' },
]

/** 검사기관 코드(직접 입력 제외) — 직접 입력 모드 판별용. */
const LAB_CODES = LAB_OPTIONS.filter((o) => o.value !== CUSTOM_LAB).map((o) => o.value)

export function TiterInputs({
  form,
  onChange,
}: {
  form: TiterForm
  onChange: (key: keyof TiterForm, next: string) => void
}) {
  const C = {
    surface: 'var(--pm-surface)',
    line: 'var(--pm-line)',
    ink: 'var(--pm-ink)',
    ink2: 'var(--pm-ink-2)',
    accent: 'var(--pm-accent)',
    accentSoft: 'rgba(184,153,104,.14)',
  } as const

  // 검사기관 — lab 이 코드 목록에 없으면 직접 입력 모드. lab 이 비었지만 사용자가
  // 방금 '직접 입력' 을 고른 경우(아직 미입력)도 직접 입력 모드로 본다.
  const [pickedCustom, setPickedCustom] = useState(false)
  const isCustomStored = form.lab !== '' && !LAB_CODES.includes(form.lab)
  const customMode = isCustomStored || (pickedCustom && form.lab === '')
  const selectedLab = customMode ? CUSTOM_LAB : form.lab

  function handleLabSelect(next: string) {
    if (next === CUSTOM_LAB) {
      setPickedCustom(true)
      // 코드 → 직접 입력 전환 시 코드가 기관명으로 남지 않도록 비움.
      if (LAB_CODES.includes(form.lab)) onChange('lab', '')
    } else {
      setPickedCustom(false)
      onChange('lab', next)
    }
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
                  background: selected ? C.accentSoft : '#fff',
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
            value={form.lab}
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
            value={form.value}
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
