'use client'

/**
 * 항공권 구매 step 입력 필드 — 출국·귀국 항공권. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data 의 entry_* / return_* 평탄 키
 * (정보 탭 항공권 섹션·펫무브워크 추가정보와 동일).
 *
 * 편도(showReturn=false)면 출국 항공권만 렌더. 귀국 값은 폼에 남아있되 표시·편집만 숨김.
 */

export interface FlightForm {
  entry_departure_airport: string
  entry_airport: string
  entry_flight_number: string
  entry_transport: string
  return_departure_airport: string
  return_arrival_airport: string
  return_flight_number: string
  return_transport: string
}

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink3: '#9A9286',
} as const

interface FlightField {
  key: keyof FlightForm
  label: string
  placeholder: string
}

const ENTRY_FIELDS: readonly FlightField[] = [
  { key: 'entry_departure_airport', label: '출발 공항', placeholder: '예: 인천 ICN' },
  { key: 'entry_airport', label: '도착 공항', placeholder: '예: 나리타 NRT' },
  { key: 'entry_flight_number', label: '편명', placeholder: '예: KE703' },
  { key: 'entry_transport', label: '운송 방법', placeholder: '예: 수하물 / 화물' },
]

const RETURN_FIELDS: readonly FlightField[] = [
  { key: 'return_departure_airport', label: '출발 공항', placeholder: '예: 나리타 NRT' },
  { key: 'return_arrival_airport', label: '도착 공항', placeholder: '예: 인천 ICN' },
  { key: 'return_flight_number', label: '편명', placeholder: '예: KE704' },
  { key: 'return_transport', label: '운송 방법', placeholder: '예: 수하물 / 화물' },
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
      <FlightGroup label="출국 항공권" fields={ENTRY_FIELDS} value={value} onChange={onChange} />
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
  label: string
  fields: readonly FlightField[]
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
}) {
  return (
    <div>
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
          </div>
        ))}
      </div>
    </div>
  )
}
