import type { CaseInfoData, FlightInfo, GuardianInfo, PetInfo, TripInfo } from '@/lib/info/catalog'

/**
 * 케이스 정보 탭. Stone 팔레트 / Fraunces serif — TimelineCalm·DocsView 와 동일 톤.
 *
 * 시각 소스: docs/portal-preview/app.jsx 의 `Info` — 4 섹션(보호자/동물/여행/항공권).
 * 데이터가 비면 행을 '—' 로 표시. 항공권은 entry_* 또는 return_* 필드 중 하나라도 있을 때만 표시.
 */
export function InfoView({ data }: { data: CaseInfoData }) {
  const C = {
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    soft: '#E8DCC4',
    sage: '#8FA68C',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }
  const num: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 24,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>정보</h1>

        <GuardianSection guardian={data.guardian} C={C} serif={serif} num={num} monoCap={monoCap} />
        <PetSection pet={data.pet} C={C} serif={serif} num={num} monoCap={monoCap} />
        <TripSection trip={data.trip} C={C} num={num} monoCap={monoCap} />
        <FlightsSection flights={data.flights} C={C} serif={serif} num={num} monoCap={monoCap} />
      </div>
    </div>
  )
}

// ── Section helpers ─────────────────────────────────────────────────────

interface Palette {
  bg: string
  surface: string
  ink: string
  ink2: string
  ink3: string
  line: string
  accent: string
  soft: string
  sage: string
}

function Section({
  label,
  C,
  monoCap,
  children,
}: {
  label: string
  C: Palette
  monoCap: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>{label}</div>
      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 18,
          padding: '4px 16px',
        }}
      >
        {children}
      </div>
    </>
  )
}

function Row({
  label,
  value,
  value2,
  last,
  wrap,
  C,
}: {
  label: string
  value: React.ReactNode
  value2?: React.ReactNode
  last?: boolean
  wrap?: boolean
  C: Palette
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: wrap ? 'flex-start' : 'center',
        padding: '13px 0',
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, color: C.ink2, flexShrink: 0, paddingTop: wrap ? 2 : 0 }}>{label}</span>
      <div style={{ textAlign: 'right', minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 17,
            color: C.ink,
            fontWeight: 500,
            overflow: wrap ? 'visible' : 'hidden',
            textOverflow: wrap ? 'clip' : 'ellipsis',
            whiteSpace: wrap ? 'normal' : 'nowrap',
            lineHeight: wrap ? 1.5 : 1.3,
            textWrap: 'pretty' as React.CSSProperties['textWrap'],
          }}
        >
          {value}
        </div>
        {value2 != null && (
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{value2}</div>
        )}
      </div>
    </div>
  )
}

function Dash({ C }: { C: Palette }) {
  return <span style={{ color: C.ink3 }}>—</span>
}

function BilingualName({
  ko,
  en,
  C,
  serif,
}: {
  ko: string | null
  en: string | null
  C: Palette
  serif: React.CSSProperties
}) {
  if (!ko && !en) return <Dash C={C} />
  if (!en) return <span>{ko}</span>
  if (!ko)
    return <span style={{ ...serif, fontStyle: 'italic', fontWeight: 400 }}>{en}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <span>{ko}</span>
      <span
        style={{
          width: 1,
          height: 11,
          background: C.line,
          display: 'inline-block',
          alignSelf: 'center',
        }}
      />
      <span style={{ ...serif, fontStyle: 'italic', fontWeight: 400, color: C.ink2 }}>{en}</span>
    </span>
  )
}

// ── Guardian ───────────────────────────────────────────────────────────

function GuardianSection({
  guardian,
  C,
  serif,
  num,
  monoCap,
}: {
  guardian: GuardianInfo
  C: Palette
  serif: React.CSSProperties
  num: React.CSSProperties
  monoCap: React.CSSProperties
}) {
  const addressKo = guardian.postalCode && guardian.addressKo
    ? `(${guardian.postalCode}) ${guardian.addressKo}`
    : guardian.addressKo
  return (
    <Section label="보호자 정보" C={C} monoCap={monoCap}>
      <Row
        label="성함"
        value={<BilingualName ko={guardian.name} en={guardian.nameEn} C={C} serif={serif} />}
        C={C}
      />
      <Row
        label="전화번호"
        value={guardian.phone ? <span style={num}>{guardian.phone}</span> : <Dash C={C} />}
        C={C}
      />
      <Row label="이메일" value={guardian.email ?? <Dash C={C} />} C={C} />
      <Row label="한국주소" value={addressKo ?? <Dash C={C} />} wrap C={C} />
      <Row label="영문주소" value={guardian.addressEn ?? <Dash C={C} />} wrap last C={C} />
    </Section>
  )
}

// ── Pet ────────────────────────────────────────────────────────────────

function PetSection({
  pet,
  C,
  serif,
  num,
  monoCap,
}: {
  pet: PetInfo
  C: Palette
  serif: React.CSSProperties
  num: React.CSSProperties
  monoCap: React.CSSProperties
}) {
  return (
    <Section label="동물 정보" C={C} monoCap={monoCap}>
      <Row
        label="이름"
        value={<BilingualName ko={pet.name} en={pet.nameEn} C={C} serif={serif} />}
        C={C}
      />
      <Row
        label="마이크로칩번호"
        value={
          pet.microchip ? (
            <span style={{ ...num, letterSpacing: '0.06em' }}>{pet.microchip}</span>
          ) : (
            <Dash C={C} />
          )
        }
        C={C}
      />
      <Row
        label="생년월일"
        value={pet.birthDate ? <span style={num}>{pet.birthDate}</span> : <Dash C={C} />}
        value2={pet.ageLabel ? `연령 ${pet.ageLabel}` : undefined}
        C={C}
      />
      <Row label="종" value={pet.species ?? <Dash C={C} />} C={C} />
      <Row label="품종" value={pet.breed ?? <Dash C={C} />} C={C} />
      <Row label="모색" value={pet.color ?? <Dash C={C} />} C={C} />
      <Row label="성별" value={pet.sex ?? <Dash C={C} />} C={C} />
      <Row
        label="몸무게"
        value={pet.weight ? <span style={num}>{pet.weight}</span> : <Dash C={C} />}
        last
        C={C}
      />
    </Section>
  )
}

// ── Trip ───────────────────────────────────────────────────────────────

function TripSection({
  trip,
  C,
  num,
  monoCap,
}: {
  trip: TripInfo
  C: Palette
  num: React.CSSProperties
  monoCap: React.CSSProperties
}) {
  const isRound = trip.tripType === 'round'
  const showReturnRow = isRound && trip.returnDate
  const dDayLabel =
    trip.daysLeft == null
      ? null
      : trip.daysLeft > 0
        ? `D-${trip.daysLeft}`
        : trip.daysLeft === 0
          ? 'D-DAY'
          : `D+${-trip.daysLeft}`

  return (
    <Section label="여행 정보" C={C} monoCap={monoCap}>
      <Row label="여행지" value={trip.toCountry ?? <Dash C={C} />} C={C} />
      <Row
        label="유형"
        value={
          <span
            style={{
              ...monoCap,
              padding: '3px 8px',
              borderRadius: 999,
              background: isRound ? C.soft : 'rgba(42,38,32,.04)',
              color: isRound ? C.accent : C.ink2,
              fontWeight: 600,
            }}
          >
            {isRound ? '왕복' : '편도'}
          </span>
        }
        C={C}
      />
      <Row
        label="출국일"
        value={
          trip.departureDate ? (
            <span style={num}>{trip.departureDate.replace(/-/g, '·')}</span>
          ) : (
            <Dash C={C} />
          )
        }
        value2={dDayLabel ?? undefined}
        last={!showReturnRow}
        C={C}
      />
      {showReturnRow && (
        <Row
          label="귀국일"
          value={<span style={num}>{trip.returnDate!.replace(/-/g, '·')}</span>}
          last
          C={C}
        />
      )}
    </Section>
  )
}

// ── Flights ────────────────────────────────────────────────────────────

function FlightsSection({
  flights,
  C,
  serif,
  num,
  monoCap,
}: {
  flights: FlightInfo[]
  C: Palette
  serif: React.CSSProperties
  num: React.CSSProperties
  monoCap: React.CSSProperties
}) {
  if (flights.length === 0) {
    return (
      <>
        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>항공권 정보</div>
        <div
          style={{
            background: C.surface,
            border: `.5px dashed ${C.line}`,
            borderRadius: 18,
            padding: '14px 16px',
            fontSize: 13,
            color: C.ink3,
            lineHeight: 1.55,
          }}
        >
          항공권 정보가 등록되면 출국·귀국 편이 여기에 표시됩니다.
        </div>
      </>
    )
  }

  return (
    <Section label="항공권 정보" C={C} monoCap={monoCap}>
      {flights.map((f, i) => {
        const last = i === flights.length - 1
        return (
          <div
            key={f.direction}
            style={{
              padding: '14px 0',
              borderBottom: last ? 'none' : `.5px solid ${C.line}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={monoCap}>{f.label}</span>
              {f.date && (
                <span style={{ ...num, fontSize: 12, color: C.ink2 }}>
                  {f.date.replace(/-/g, '·')}
                </span>
              )}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'left', flexShrink: 0 }}>
                <div style={{ ...serif, fontSize: 20, color: C.ink, lineHeight: 1 }}>
                  {f.fromAirport ?? '—'}
                </div>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 12 }}>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 6,
                    right: 6,
                    height: 1,
                    background: C.line,
                  }}
                />
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.accent}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    background: C.surface,
                    padding: 1,
                  }}
                >
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                </svg>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...serif, fontSize: 20, color: C.ink, lineHeight: 1 }}>
                  {f.toAirport ?? '—'}
                </div>
              </div>
            </div>
            {(f.flightNumber || f.transport) && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                {f.flightNumber ? (
                  <span style={{ ...num, color: C.ink, fontWeight: 500 }}>{f.flightNumber}</span>
                ) : (
                  <span />
                )}
                {f.transport && (
                  <span style={{ color: C.ink3, fontSize: 12 }}>{f.transport}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}
