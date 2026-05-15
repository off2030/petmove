'use client'

import { useState } from 'react'
import { TITER_LABS } from '@petmove/domain'
import { DateTextField } from '@petmove/ui'
import { SelectField, type SelectOption } from './select-field'

/**
 * 광견병 항체가 검사 step 입력 필드 — 채혈일 + 검사기관 + 검사결과. controlled — 부모
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

/** 드롭다운에 노출하는 검사기관 코드. */
const KNOWN_LAB_CODES = ['apqa_seoul', 'ksvdl_r']
/** '직접 입력' 옵션 sentinel — form.lab 에 저장되지 않고 드롭다운 표시용으로만 쓰임. */
const CUSTOM_LAB = '__custom__'

/** 검사기관 드롭다운 옵션 — APQA Seoul·KSVDL-R + 직접 입력. */
const LAB_OPTIONS: SelectOption[] = [
  ...TITER_LABS.filter((l) => KNOWN_LAB_CODES.includes(l.value)),
  { value: CUSTOM_LAB, label: '직접 입력' },
]

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

  // 검사기관 — lab 이 드롭다운 코드가 아니면 직접 입력 모드. lab 이 비었지만 사용자가
  // 방금 '직접 입력' 을 고른 경우(아직 미입력)도 직접 입력 모드로 본다.
  const [pickedCustom, setPickedCustom] = useState(false)
  const isCustomStored = form.lab !== '' && !KNOWN_LAB_CODES.includes(form.lab)
  const customMode = isCustomStored || (pickedCustom && form.lab === '')

  function handleLabSelect(next: string) {
    if (next === CUSTOM_LAB) {
      setPickedCustom(true)
      // 코드 → 직접 입력 전환 시 코드가 기관명으로 남지 않도록 비움.
      if (KNOWN_LAB_CODES.includes(form.lab)) onChange('lab', '')
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
          />
        </div>
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사기관</div>
        <div style={{ marginTop: 8 }}>
          <SelectField
            value={customMode ? CUSTOM_LAB : form.lab}
            options={LAB_OPTIONS}
            onChange={handleLabSelect}
          />
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
