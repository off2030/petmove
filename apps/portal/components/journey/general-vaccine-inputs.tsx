'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'
import { CollapsibleSection } from './collapsible-section'
import type { RabiesProductHints } from './rabies-entry-inputs'

/**
 * 종합백신·구충 step 입력 — 가변 길이 배열 + 추가/삭제 (TiterExtraInputs·RabiesExtraInputs 모델).
 *
 * 저장 형식: case.data.general_vaccine_dates[index] = { date, valid_until, product,
 * manufacturer, lot, expiry, other_hospital } — 광견병(rabies_dates)과 동일 키 구성.
 * 동물 단위 사실이라 목적지 스코핑 없음.
 *
 * 종합백신은 약품 4필드(showProduct) + 펫무브워크 약품 카탈로그 자동추천(productHintsFor)을
 * 광견병과 동일하게 쓴다. 본병원이면 약품칸 읽기 전용 + 자동 채움, 타병원이면 직접 입력.
 * 구충 처치는 약품·유효기간이 없어 showProduct·showValidUntil=false 로 날짜만 받는다.
 */

export interface GeneralVaccineEntry {
  date: string
  valid_until: string
  product: string
  manufacturer: string
  lot: string
  expiry: string
  /** 펫무브워크가 설정한 타병원 접종 여부. portal 은 표시만 — 신규 카드는 true. */
  other_hospital: boolean
}


type ProductFieldKey = 'product' | 'manufacturer' | 'lot' | 'expiry'

/** 약품 4필드 — placeholder 는 백신 기본값. step 별로 productPlaceholders 로 덮어쓸 수 있음(예: 구충제). */
const PRODUCT_FIELDS: ReadonlyArray<{
  key: ProductFieldKey
  label: string
  kind: 'text' | 'date'
  placeholder?: string
}> = [
  { key: 'product', label: '약품명', kind: 'text', placeholder: '예: Canishot DHPPL' },
  { key: 'manufacturer', label: '제조사', kind: 'text', placeholder: '예: CAVAC' },
  { key: 'lot', label: '제조번호', kind: 'text', placeholder: '예: 323 DPL 02' },
  { key: 'expiry', label: '제품 유효기간', kind: 'date' },
]

/** step 별 약품 예시(placeholder) 덮어쓰기. 키별로 지정한 것만 교체, 나머지는 기본값. */
export type ProductPlaceholders = Partial<Record<ProductFieldKey, string>>

/** "N년" 문자열 → 선택된 연수. 빈값은 1년 기본. 그 외(날짜 등)는 미선택. (광견병과 동일.) */
function selectedYear(value: string): string | null {
  const m = value.match(/^(\d+)\s*년$/)
  if (m) return m[1]
  if (value.trim() === '') return '1'
  return null
}

export function GeneralVaccineInputs({
  entries,
  vaccineLabel,
  onChange,
  onRemove,
  onAdd,
  dateLabel = '접종일',
  showValidUntil = true,
  showProduct = true,
  addLabel = '+ 접종 기록 추가',
  productHintsFor,
  productPlaceholders,
}: {
  entries: GeneralVaccineEntry[]
  /** 카드 헤더 라벨 — 종별 백신명 (예: '종합백신(DHPPL)') 또는 처치명 ('외부구충'). */
  vaccineLabel: string
  onChange: (index: number, key: keyof GeneralVaccineEntry, next: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
  /** 날짜 필드 라벨 — 백신 '접종일', 구충 '처치일'/'투약일'. */
  dateLabel?: string
  /** 면역 유효기간 필드 노출 — 구충 처치는 유효기간 개념이 없어 숨김. */
  showValidUntil?: boolean
  /** 약품 4필드(약품명·제조사·제조번호·제품유효기간) 노출 — 백신만. 구충은 숨김. */
  showProduct?: boolean
  addLabel?: string
  /** 각 entry 접종일 기준 카탈로그 자동추천 — 본병원일 때 약품 4필드에 읽기 전용 표시(광견병과 동일). */
  productHintsFor?: (index: number) => RabiesProductHints | null
  /** 약품 예시(placeholder) 덮어쓰기 — 구충제는 백신 예시 대신 구충제 예시(종별 다름)를 보여준다. */
  productPlaceholders?: ProductPlaceholders
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((entry, i) => (
        <EntryCard
          key={i}
          entry={entry}
          title={i === 0 ? vaccineLabel : `${vaccineLabel} ${i + 1}차`}
          dateLabel={dateLabel}
          showValidUntil={showValidUntil}
          showProduct={showProduct}
          productHints={productHintsFor?.(i) ?? null}
          productPlaceholders={productPlaceholders}
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
        {addLabel}
      </button>
    </div>
  )
}

function EntryCard({
  entry,
  title,
  dateLabel,
  showValidUntil,
  showProduct,
  productHints,
  productPlaceholders,
  onChange,
  onRemove,
}: {
  entry: GeneralVaccineEntry
  title: string
  dateLabel: string
  showValidUntil: boolean
  showProduct: boolean
  productHints: RabiesProductHints | null
  productPlaceholders?: ProductPlaceholders
  onChange: (key: keyof GeneralVaccineEntry, next: string) => void
  onRemove: () => void
}) {
  const otherHospital = entry.other_hospital !== false
  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const labelStyle: React.CSSProperties = { fontSize: 13, color: C.ink, fontWeight: 500 }
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

  // 접종일만 항상 노출, 면역 유효기간·약품 정보는 '세부 정보' 접기. 구충(둘 다 false)은 접을 게 없어 미노출.
  const hasDetail = showValidUntil || showProduct
  const detailHasData =
    (showValidUntil && entry.valid_until.trim() !== '') ||
    (showProduct && PRODUCT_FIELDS.some((f) => entry[f.key].trim() !== ''))

  const validUntilRow = showValidUntil && (
    <div style={{ padding: '14px 0' }}>
      <div style={labelStyle}>면역 유효기간</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        {(['1', '2', '3'] as const).map((n) => {
          const selected = selectedYear(entry.valid_until) === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange('valid_until', `${n}년`)}
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
    </div>
  )

  const productRows =
    showProduct &&
    PRODUCT_FIELDS.map((field, idx) => {
      const designated = !otherHospital
      const hint = designated ? productHints?.[field.key] : undefined
      // 세부 카드의 첫 행만 구분선 없음 — 유효기간이 앞에 있으면 약품은 항상 구분선.
      const borderTop = showValidUntil || idx > 0 ? `.5px solid ${C.line}` : undefined
      return (
        <div key={field.key} style={{ padding: '14px 0', borderTop }}>
          <div style={labelStyle}>
            {field.label}
            {designated && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: C.ink3 }}>
                병원 지정
              </span>
            )}
          </div>
          {designated ? (
            <div style={designatedStyle}>{hint || <span style={{ color: C.ink3 }}>—</span>}</div>
          ) : field.kind === 'date' ? (
            <div style={{ marginTop: 8 }}>
              <DateTextField
                value={entry[field.key]}
                onChange={(v) => onChange(field.key, v)}
                placeholder="YYYY-MM-DD"
                block
              />
            </div>
          ) : (
            <input
              type="text"
              value={entry[field.key]}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={productPlaceholders?.[field.key] ?? field.placeholder}
              style={inputStyle}
            />
          )}
        </div>
      )
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={cardStyle}>
        <div
          style={{
            padding: '12px 0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</div>
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
          <div style={labelStyle}>{dateLabel}</div>
          <div style={{ marginTop: 8 }}>
            <DateTextField
              value={entry.date}
              onChange={(v) => onChange('date', v)}
              placeholder="YYYY-MM-DD"
              block
            />
          </div>
        </div>
      </div>

      {hasDetail && (
        <CollapsibleSection label="세부 정보 (선택)" defaultOpen={detailHasData}>
          <div style={cardStyle}>
            {validUntilRow}
            {productRows}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
