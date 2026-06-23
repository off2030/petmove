'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'
import { CollapsibleSection } from './collapsible-section'

/**
 * 광견병 백신 step(1·2차) 입력 필드. controlled — 부모(step-detail-view)가 state·save 보유.
 *
 * 접종일·제품 유효기간은 @petmove/ui 의 DateTextField (apply 신청폼·마이크로칩 step 과
 * 동일 컴포넌트). 면역 유효기간은 1/2/3년 선택 — 펫무브워크 ValidUntilSelector 와 동일
 * (저장값 "1년"/"2년"/"3년"). 약품명·제조사·제조번호는 텍스트 입력.
 * 저장 형식은 case.data.rabies_dates[index] — 키는 펫무브워크 RepeatableDateField 와 동일.
 */

export interface RabiesEntryForm {
  date: string
  valid_until: string
  product: string
  manufacturer: string
  lot: string
  expiry: string
}

/**
 * 약품 정보 필드(제품명·제조사·제조번호·제품 유효기간)의 "지정 약품" 힌트.
 * 펫무브워크 케이스 상세가 보여주는 자동 추론 약품과 동일 — 빈 필드에 옅게 표시.
 */
export interface RabiesProductHints {
  product?: string
  manufacturer?: string
  lot?: string
  expiry?: string
}

const FIELDS: ReadonlyArray<{
  key: keyof RabiesEntryForm
  label: string
  kind: 'date' | 'text' | 'years'
  placeholder?: string
}> = [
  { key: 'date', label: '접종일', kind: 'date' },
  { key: 'valid_until', label: '면역 유효기간', kind: 'years' },
  { key: 'product', label: '약품명', kind: 'text', placeholder: '예: Rabisin' },
  { key: 'manufacturer', label: '제조사', kind: 'text', placeholder: '예: Boehringer Ingelheim' },
  { key: 'lot', label: '제조번호', kind: 'text', placeholder: '예: G98321' },
  { key: 'expiry', label: '제품 유효기간', kind: 'date' },
]

/**
 * valid_until 문자열에서 선택된 연수를 추출. "N년" → "N", 미입력 → "1"(기본),
 * 그 외(날짜 등 legacy 값) → null. 펫무브워크 ValidUntilSelector 와 동일 규칙.
 */
function selectedYear(value: string): string | null {
  const m = value.match(/^(\d+)\s*년$/)
  if (m) return m[1]
  if (value.trim() === '') return '1'
  return null
}

/**
 * 약품 정보 필드(product/manufacturer/lot/expiry)의 지정 약품 힌트를 반환.
 * date/valid_until 은 힌트 대상이 아니고, hints 가 없으면(타병원 접종 등) undefined.
 */
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

export function RabiesEntryInputs({
  value,
  onChange,
  productHints,
  otherHospital,
}: {
  value: RabiesEntryForm
  onChange: (key: keyof RabiesEntryForm, next: string) => void
  /** 약품 정보 4필드의 지정 약품(카탈로그 자동 추론). 본병원일 때 읽기 전용으로 표시. */
  productHints?: RabiesProductHints | null
  /** 타병원 접종 여부. 본병원이면 약품칸은 지정 약품 읽기 전용, 타병원이면 직접 입력. */
  otherHospital?: boolean
}) {

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
    background: 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
  }
  // 본병원 — 약품 정보는 병원 지정 약품을 읽기 전용으로 표시.
  const designatedStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'rgb(var(--pm-ink-rgb) / .035)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink2,
    boxSizing: 'border-box',
  }

  const renderRows = (subset: typeof FIELDS) =>
    subset.map((field, i) => {
      const isProduct =
        field.key === 'product' ||
        field.key === 'manufacturer' ||
        field.key === 'lot' ||
        field.key === 'expiry'
      // 본병원(타병원 미체크) — 약품칸은 지정 약품을 읽기 전용으로 표시.
      const designated = isProduct && !otherHospital
      const hint = designated ? hintForKey(field.key, productHints) : undefined
      return (
        <div
          key={field.key}
          style={{
            padding: '14px 0',
            borderTop: i === 0 ? undefined : `.5px solid ${C.line}`,
          }}
        >
          <div style={labelStyle}>
            {field.label}
            {designated && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: C.ink3 }}>
                병원 지정
              </span>
            )}
          </div>
          {field.kind === 'years' ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              {(['1', '2', '3'] as const).map((n) => {
                const selected = selectedYear(value[field.key]) === n
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
                      background: selected ? C.ink : 'var(--pm-surface)',
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
            <div style={designatedStyle}>{hint || <span style={{ color: C.ink3 }}>—</span>}</div>
          ) : field.kind === 'date' ? (
            <div style={{ marginTop: 8 }}>
              <DateTextField
                value={value[field.key]}
                onChange={(v) => onChange(field.key, v)}
                placeholder="YYYY-MM-DD"
                block
              />
            </div>
          ) : (
            <input
              type="text"
              value={value[field.key]}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              style={inputStyle}
            />
          )}
        </div>
      )
    })

  // 접종일만 항상 노출, 나머지(면역 유효기간·약품 정보)는 '세부 정보' 접기.
  const detailFields = FIELDS.slice(1)
  // 본병원이면 약품 4필드는 직접 입력값(value)이 아니라 병원 지정 약품(productHints)으로
  // 읽기 전용 표시된다 — 그 값도 '내용 있음'으로 쳐야 채워진 카드가 펼친 상태로 뜬다.
  const hasDesignated =
    !otherHospital &&
    (['product', 'manufacturer', 'lot', 'expiry'] as const).some(
      (k) => (productHints?.[k] ?? '').trim() !== '',
    )
  const detailHasData =
    hasDesignated || detailFields.some((f) => value[f.key].trim() !== '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={cardStyle}>{renderRows(FIELDS.slice(0, 1))}</div>
      <CollapsibleSection label="세부 정보 (선택)" defaultOpen={detailHasData}>
        <div style={cardStyle}>{renderRows(detailFields)}</div>
      </CollapsibleSection>
    </div>
  )
}
