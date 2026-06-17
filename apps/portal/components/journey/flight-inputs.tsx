'use client'

import type { ReactNode } from 'react'
import { DateTextField } from '@petmove/ui'
import { CollapsibleSection } from './collapsible-section'

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
  /**
   * 귀국 항공권 '미정' 플래그 — 왕복인데 귀국편을 아직 안 정한 경우 '1'. 출국 일정만으로
   * 항공권 구매 step 을 완료로 인정(done-resolver has-flight-date). 귀국일이 입력되면 의미가
   * 없어 자동 해제('')되고 토글도 숨긴다. trip_type 은 round 그대로 — 귀국 검역 단계는 유지.
   */
  return_undecided: string
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
  entryFieldKeys,
  returnFieldKeys,
  fieldPlaceholders,
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
  /**
   * 출국·귀국 leg 에서 받을 필드를 키로 한정(미지정=전체). 나라별 최소 입력용 —
   * 예: 필리핀은 출국 [날짜·도착공항] / 귀국 [날짜](+미정 토글)만 받는다.
   * departureFirst 레이아웃은 별도 상수를 쓰므로 영향 없음(기본·collapsible 레이아웃에만 적용).
   */
  entryFieldKeys?: ReadonlyArray<keyof FlightForm>
  returnFieldKeys?: ReadonlyArray<keyof FlightForm>
  /**
   * 필드 예시(placeholder) 덮어쓰기 — 기본 예시가 일본 기준(나리타 NRT)이라 목적지별로 교체.
   * 예: 필리핀 도착 공항은 '예: 마닐라 MNL'. 키별로 지정한 것만 교체, 나머지는 기본값.
   */
  fieldPlaceholders?: Partial<Record<keyof FlightForm, string>>
}) {
  const drop = (fields: readonly FlightField[]) =>
    showTransport ? fields : fields.filter((f) => f.kind !== 'transport')
  // 목적지별 예시(placeholder) 덮어쓰기 적용 — 지정된 키만 교체.
  const withPlaceholders = (fields: readonly FlightField[]) =>
    fieldPlaceholders
      ? fields.map((f) =>
          fieldPlaceholders[f.key] != null ? { ...f, placeholder: fieldPlaceholders[f.key] } : f,
        )
      : fields
  // 나라별 필드 한정 — 키 목록이 주어지면 그 키만, 없으면 전체.
  const selectedEntryFields = withPlaceholders(
    entryFieldKeys ? ENTRY_FIELDS.filter((f) => entryFieldKeys.includes(f.key)) : ENTRY_FIELDS,
  )
  const selectedReturnFields = withPlaceholders(
    returnFieldKeys ? RETURN_FIELDS.filter((f) => returnFieldKeys.includes(f.key)) : RETURN_FIELDS,
  )

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
      const entryFields = drop(selectedEntryFields)
      outboundPrimary = entryFields.slice(0, 1)
      outboundDetail = entryFields.slice(1)
    }
    const returnFields = drop(selectedReturnFields)
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
            // '미정' 토글을 귀국일 카드 안, 날짜 바로 아래에 끼운다.
            fieldFooter={{ return_date: <ReturnUndecidedToggle value={value} onChange={onChange} /> }}
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
        fields={drop(selectedEntryFields)}
        value={value}
        onChange={onChange}
      />
      {showReturn && (
        <FlightGroup
          label="귀국 항공권"
          fields={drop(selectedReturnFields)}
          value={value}
          onChange={onChange}
          // '미정' 토글을 귀국일 카드 안, 날짜 바로 아래에 끼운다.
          fieldFooter={{ return_date: <ReturnUndecidedToggle value={value} onChange={onChange} /> }}
        />
      )}
    </div>
  )
}

/**
 * 귀국 항공권 '미정' 체크 — 귀국일 카드 안, 날짜 바로 아래. 체크하면 출국 일정만으로 항공권
 * 구매 step 이 완료된다(done-resolver). 귀국일이 입력되면 불필요하므로 숨긴다(상위에서 플래그 해제).
 */
function ReturnUndecidedToggle({
  value,
  onChange,
}: {
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
}) {
  if (value.return_date.trim().length > 0) return null
  const checked = value.return_undecided === '1'
  return (
    <button
      type="button"
      onClick={() => onChange('return_undecided', checked ? '' : '1')}
      aria-pressed={checked}
      className="pm-pressable"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        // 체크 여부와 무관하게 높이를 고정 — 토글 시 카드 높이가 흔들리지 않게.
        height: 22,
        marginTop: 10,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          boxSizing: 'border-box',
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `1.5px solid ${checked ? C.ink : C.ink3}`,
          background: checked ? C.ink : 'transparent',
          color: C.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          lineHeight: 1,
          transition: 'background .12s, border-color .12s',
        }}
      >
        {/* 체크마크는 항상 렌더하고 opacity 로만 토글 — 글리프 추가/제거에 의한 리플로우 방지. */}
        <span style={{ opacity: checked ? 1 : 0 }}>✓</span>
      </span>
      <span style={{ fontSize: 14, lineHeight: 1, fontWeight: 500, color: checked ? C.ink : C.ink2 }}>
        미정
      </span>
    </button>
  )
}

/** 항공권 한 leg(출국/귀국) — 날짜(주필드) 항상 노출 + '세부 정보' 접기. 두 leg 가 동등 구조. */
function CollapsibleLeg({
  headerLabel,
  primaryFields,
  detailFields,
  value,
  onChange,
  fieldFooter,
}: {
  headerLabel?: string
  primaryFields: readonly FlightField[]
  detailFields: readonly FlightField[]
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
  /** 주필드(날짜) 카드에 전달할 키별 footer — 귀국일 아래 '미정' 체크. */
  fieldFooter?: Partial<Record<keyof FlightForm, ReactNode>>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {primaryFields.length > 0 && (
        <FlightGroup
          label={headerLabel}
          fields={primaryFields}
          value={value}
          onChange={onChange}
          fieldFooter={fieldFooter}
        />
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
  // 기본 닫힘 — 단, 이미 입력된 값이 있으면 자동 펼침(기존 정보가 숨겨지지 않게).
  const hasData = fields.some((f) => value[f.key].trim().length > 0)
  return (
    <CollapsibleSection label={label} defaultOpen={hasData}>
      <FlightGroup fields={fields} value={value} onChange={onChange} />
    </CollapsibleSection>
  )
}

function FlightGroup({
  label,
  fields,
  value,
  onChange,
  fieldFooter,
}: {
  label?: string
  fields: readonly FlightField[]
  value: FlightForm
  onChange: (key: keyof FlightForm, next: string) => void
  /** 특정 필드의 입력칸 바로 아래(같은 카드 안)에 끼울 노드 — 키별. (예: 귀국일 아래 '미정'.) */
  fieldFooter?: Partial<Record<keyof FlightForm, ReactNode>>
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
            {fieldFooter?.[field.key] ?? null}
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
