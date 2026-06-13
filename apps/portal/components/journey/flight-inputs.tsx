'use client'

import { useState } from 'react'
import { DateTextField } from '@petmove/ui'

/**
 * 항공권 구매 step 입력 필드 — 출국·귀국 항공권. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data 의 entry_* / return_* 평탄 키
 * (정보 탭 항공권 섹션·펫무브워크 추가정보와 동일).
 *
 * 편도(showReturn=false)면 출국 항공권만 렌더. 귀국 값은 폼에 남아있되 표시·편집만 숨김.
 */

export interface FlightForm {
  /** 출발일(한국 출국일) — departure_date 컬럼. 태국 카드의 주필드·검증 기준. */
  departure_date: string
  /** 도착일(입국일) — entry_date. 출발일과 다른 날일 수 있음(레드아이 등). */
  entry_date: string
  /** 도착 시간 — entry_time(HH:mm). */
  entry_time: string
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
  surface: 'var(--pm-surface)',
  line: 'var(--pm-line)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
} as const

/**
 * 운송 방법 선택지 — 보호자 친근 라벨 chip. share 폼(share-form.tsx)의 고객용 2지와 동일.
 * value 는 펫무브워크 추가정보 TRANSPORT_OPTIONS 와 같은 영문 코드라 수출서류 생성과
 * round-trip. Cargo / Cargo(Sea) 는 고객에게 받지 않음 — 케이스 상세에서 발신자가 직접 조정.
 */
const TRANSPORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'Carry-on', label: '기내탑승' },
  { value: 'Checked-baggage', label: '위탁수하물' },
]

interface FlightField {
  key: keyof FlightForm
  label: string
  kind: 'text' | 'date' | 'time' | 'transport'
  placeholder?: string
}

const ENTRY_FIELDS: readonly FlightField[] = [
  { key: 'entry_date', label: '날짜', kind: 'date' },
  { key: 'entry_departure_airport', label: '출발 공항', kind: 'text', placeholder: '예: 인천 ICN' },
  { key: 'entry_airport', label: '도착 공항', kind: 'text', placeholder: '예: 나리타 NRT' },
  { key: 'entry_flight_number', label: '편명', kind: 'text', placeholder: '예: KE703' },
  { key: 'entry_transport', label: '운송 방법', kind: 'transport' },
]

// 출발일 우선 레이아웃(태국 등) — 출발일만 항상 노출, 나머지는 '세부 정보' 접기 안.
const DEPARTURE_PRIMARY_FIELD: FlightField = {
  key: 'departure_date',
  label: '출발일',
  kind: 'date',
}
const DEPARTURE_DETAIL_FIELDS: readonly FlightField[] = [
  { key: 'entry_date', label: '도착일', kind: 'date' },
  { key: 'entry_time', label: '도착 시간', kind: 'time', placeholder: '예: 14:30' },
  { key: 'entry_departure_airport', label: '출발 공항', kind: 'text', placeholder: '예: 인천 ICN' },
  { key: 'entry_airport', label: '도착 공항', kind: 'text', placeholder: '예: 방콕 BKK' },
  { key: 'entry_flight_number', label: '편명', kind: 'text', placeholder: '예: KE651' },
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
  showTransport = true,
  departureFirst = false,
  collapsible = false,
}: {
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
  showReturn: boolean
  /**
   * 운송 방법(transport) 노출 — 일본만 true. 운송 방법 값을 실제로 쓰는 곳은 수출서류 PDF
   * 의 japan_extra(inbound/outbound transport)뿐이라(pdf-fill.ts), 다른 나라에서는 받지 않는다.
   */
  showTransport?: boolean
  /**
   * 출발일 우선 레이아웃(태국 등) — 출발일(departure_date)만 항상 노출하고, 도착일·도착시간·
   * 공항·편명은 '세부 정보' 접기 안에 선택 입력. 검증 기준일도 출발일.
   */
  departureFirst?: boolean
  /**
   * 일반 접기 레이아웃(일본 등) — 첫 필드(날짜=entry_date)만 항상 노출, 나머지(공항·편명·운송
   * 방법)는 '세부 정보' 접기. 한국과 같은 시간대라 출발=도착이 같은 날이라 분리는 불필요.
   */
  collapsible?: boolean
}) {
  const drop = (fields: readonly FlightField[]) =>
    showTransport ? fields : fields.filter((f) => f.kind !== 'transport')

  // 출국/귀국을 동등한 leg 로 — 각 leg 는 날짜(출발일)를 항상 노출하고 나머지는 '세부 정보' 접기.
  // 태국(departureFirst): 출국 주필드=출발일, 세부=도착일·도착시간·공항·편명.
  // 일본 등(collapsible): 출국 주필드=날짜(entry_date), 세부=공항·편명·운송방법.
  if (departureFirst || collapsible) {
    let outboundPrimary: readonly FlightField[]
    let outboundDetail: readonly FlightField[]
    if (departureFirst) {
      outboundPrimary = [DEPARTURE_PRIMARY_FIELD]
      outboundDetail = DEPARTURE_DETAIL_FIELDS
    } else {
      const entryFields = drop(ENTRY_FIELDS)
      outboundPrimary = entryFields.slice(0, 1)
      outboundDetail = entryFields.slice(1)
    }
    const returnFields = drop(RETURN_FIELDS)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <CollapsibleLeg
          headerLabel={showReturn ? '출국 항공권' : undefined}
          primaryFields={outboundPrimary}
          detailFields={outboundDetail}
          value={value}
          onChange={onChange}
        />
        {showReturn && returnFields.length > 0 && (
          <CollapsibleLeg
            headerLabel="귀국 항공권"
            primaryFields={returnFields.slice(0, 1)}
            detailFields={returnFields.slice(1)}
            value={value}
            onChange={onChange}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 편도면 그룹이 하나뿐 — '출국 항공권' 라벨 생략(상위 '입력' 헤딩으로 충분). */}
      <FlightGroup
        label={showReturn ? '출국 항공권' : undefined}
        fields={drop(ENTRY_FIELDS)}
        value={value}
        onChange={onChange}
      />
      {showReturn && (
        <FlightGroup label="귀국 항공권" fields={drop(RETURN_FIELDS)} value={value} onChange={onChange} />
      )}
    </div>
  )
}

/** 항공권 한 leg(출국/귀국) — 날짜(주필드) 항상 노출 + '세부 정보' 접기. 두 leg 가 동등 구조. */
function CollapsibleLeg({
  headerLabel,
  primaryFields,
  detailFields,
  value,
  onChange,
}: {
  headerLabel?: string
  primaryFields: readonly FlightField[]
  detailFields: readonly FlightField[]
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {primaryFields.length > 0 && (
        <FlightGroup label={headerLabel} fields={primaryFields} value={value} onChange={onChange} />
      )}
      {detailFields.length > 0 && (
        <CollapsibleDetails
          label="세부 정보 (선택)"
          fields={detailFields}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  )
}

/** 출발일 외 정보 접기 — 펼치면 fields 를 FlightGroup 으로 노출. */
function CollapsibleDetails({
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
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '11px 4px',
          background: 'transparent',
          border: 0,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          color: C.ink2,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform .15s',
            transform: open ? 'rotate(90deg)' : 'none',
            color: C.ink3,
          }}
        >
          ▶
        </span>
        {label}
      </button>
      {open && (
        <div style={{ marginTop: 2 }}>
          <FlightGroup fields={fields} value={value} onChange={onChange} />
        </div>
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
                  block
                />
              </div>
            ) : field.kind === 'time' ? (
              <input
                type="text"
                inputMode="numeric"
                value={value[field.key]}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder ?? 'HH:mm'}
                style={{
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
                }}
              />
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
                  background: 'var(--pm-surface)',
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
              background: selected ? C.ink : 'var(--pm-surface)',
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
