'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 항공권 구매 step 입력 필드 — 출국·귀국 항공권. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data 의 entry_* / return_* 평탄 키
 * (정보 탭 항공권 섹션·펫무브워크 추가정보와 동일).
 *
 * 편도(showReturn=false)면 출국 항공권만 렌더. 귀국 값은 폼에 남아있되 표시·편집만 숨김.
 */

export interface FlightForm {
  entry_date: string
  entry_departure_airport: string
  entry_airport: string
  entry_flight_number: string
  entry_transport: string
  return_date: string
  return_departure_airport: string
  return_arrival_airport: string
  return_flight_number: string
  return_transport: string
}

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
} as const

/**
 * 운송 방법 선택지 — 보호자 친근 라벨 chip. share 폼(share-form.tsx)의 고객용 3지와 동일.
 * value 는 펫무브워크 추가정보 TRANSPORT_OPTIONS 와 같은 영문 코드라 수출서류 생성과
 * round-trip. Cargo(Sea) 는 고객에게 받지 않음 — 케이스 상세에서 발신자가 직접 조정.
 */
const TRANSPORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'Carry-on', label: '기내탑승' },
  { value: 'Checked-baggage', label: '위탁수하물' },
  { value: 'Cargo', label: '화물운송' },
]

interface FlightField {
  key: keyof FlightForm
  label: string
  kind: 'text' | 'date' | 'transport'
  placeholder?: string
}

const ENTRY_FIELDS: readonly FlightField[] = [
  { key: 'entry_date', label: '날짜', kind: 'date' },
  { key: 'entry_departure_airport', label: '출발 공항', kind: 'text', placeholder: '예: 인천 ICN' },
  { key: 'entry_airport', label: '도착 공항', kind: 'text', placeholder: '예: 나리타 NRT' },
  { key: 'entry_flight_number', label: '편명', kind: 'text', placeholder: '예: KE703' },
  { key: 'entry_transport', label: '운송 방법', kind: 'transport' },
]

const RETURN_FIELDS: readonly FlightField[] = [
  { key: 'return_date', label: '날짜', kind: 'date' },
  { key: 'return_departure_airport', label: '출발 공항', kind: 'text', placeholder: '예: 나리타 NRT' },
  { key: 'return_arrival_airport', label: '도착 공항', kind: 'text', placeholder: '예: 인천 ICN' },
  { key: 'return_flight_number', label: '편명', kind: 'text', placeholder: '예: KE704' },
  { key: 'return_transport', label: '운송 방법', kind: 'transport' },
]

export function FlightInputs({
  value,
  onChange,
  showReturn,
}: {
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
  showReturn: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 편도면 그룹이 하나뿐 — '출국 항공권' 라벨 생략(상위 '입력' 헤딩으로 충분). */}
      <FlightGroup
        label={showReturn ? '출국 항공권' : undefined}
        fields={ENTRY_FIELDS}
        value={value}
        onChange={onChange}
      />
      {showReturn && (
        <FlightGroup label="귀국 항공권" fields={RETURN_FIELDS} value={value} onChange={onChange} />
      )}
    </div>
  )
}

function FlightGroup({
  label,
  fields,
  value,
  onChange,
}: {
  label?: string
  fields: readonly FlightField[]
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
}) {
  return (
    <div>
      {label && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: C.ink3,
            fontWeight: 500,
            marginBottom: 8,
            padding: '0 4px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 16,
          padding: '4px 16px',
        }}
      >
        {fields.map((field, i) => (
          <div
            key={field.key}
            style={{ padding: '14px 0', borderTop: i === 0 ? undefined : `.5px solid ${C.line}` }}
          >
            <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{field.label}</div>
            {field.kind === 'transport' ? (
              <TransportSelect
                value={value[field.key]}
                onChange={(next) => onChange(field.key, next)}
              />
            ) : field.kind === 'date' ? (
              <div style={{ marginTop: 8 }}>
                <DateTextField
                  value={value[field.key]}
                  onChange={(next) => onChange(field.key, next)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            ) : (
              <input
                type="text"
                value={value[field.key]}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={{
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
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 운송 방법 — 고객용 3지 chip 선택. 선택된 항목을 다시 누르면 해제. */
function TransportSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {TRANSPORT_OPTIONS.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(selected ? '' : o.value)}
            aria-pressed={selected}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
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
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
