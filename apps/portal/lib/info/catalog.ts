import type { CaseRow } from '@petmove/domain'
import { buildCaseJourneyContext } from '@petmove/domain'

/**
 * Portal 정보 탭(/cases/<id>/info) 데이터 모델.
 *
 * 시각 소스: docs/portal-preview/app.jsx 의 `Info` — 보호자/동물/여행/항공권 4 섹션.
 * 빌더는 read-only — caseRow 의 필드들을 안전하게 추출.
 */

export interface CaseInfoData {
  guardian: GuardianInfo
  pet: PetInfo
  trip: TripInfo
  flights: FlightInfo[]
}

export interface GuardianInfo {
  name: string | null
  nameEn: string | null
  phone: string | null
  email: string | null
  addressKo: string | null
  addressEn: string | null
  postalCode: string | null
}

export interface PetInfo {
  name: string | null
  nameEn: string | null
  species: string | null
  breed: string | null
  color: string | null
  sex: string | null
  birthDate: string | null
  ageLabel: string | null
  weight: string | null
  microchip: string | null
}

export interface TripInfo {
  toCountry: string | null
  tripType: 'round' | 'one_way'
  departureDate: string | null
  daysLeft: number | null
  returnDate: string | null
}

export interface FlightInfo {
  direction: 'outbound' | 'inbound'
  label: '출국' | '귀국'
  date: string | null
  fromAirport: string | null
  toAirport: string | null
  flightNumber: string | null
  transport: string | null
}

export function buildInfoView(caseRow: CaseRow): CaseInfoData {
  const ctx = buildCaseJourneyContext(caseRow)
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  const today = todayIso()
  const dep = caseRow.departure_date
  const daysLeft = dep ? daysBetween(today, dep) : null

  const guardian: GuardianInfo = {
    name: caseRow.customer_name || null,
    nameEn: caseRow.customer_name_en || null,
    phone: pickString(data, 'phone'),
    email: pickString(data, 'email'),
    addressKo: pickString(data, 'address_kr') ?? pickString(data, 'address_ko'),
    addressEn: pickString(data, 'address_en') ?? pickString(data, 'address_overseas'),
    postalCode: pickString(data, 'postal_code') ?? pickString(data, 'zipcode'),
  }

  const birth = pickString(data, 'birth_date')
  const pet: PetInfo = {
    name: caseRow.pet_name,
    nameEn: caseRow.pet_name_en,
    species: pickString(data, 'species'),
    breed: pickString(data, 'breed'),
    color: pickString(data, 'color'),
    sex: pickString(data, 'sex'),
    birthDate: birth,
    ageLabel: birth ? formatAge(birth, today) : null,
    weight: pickString(data, 'weight'),
    microchip: caseRow.microchip,
  }

  const trip: TripInfo = {
    toCountry: ctx.destinationToken ?? caseRow.destination ?? null,
    tripType: ctx.tripType,
    departureDate: dep,
    daysLeft,
    returnDate: ctx.tripType === 'round' ? (pickString(data, 'return_date') ?? null) : null,
  }

  const flights: FlightInfo[] = []
  const outbound: FlightInfo = {
    direction: 'outbound',
    label: '출국',
    date: pickString(data, 'entry_date') ?? dep,
    fromAirport: pickString(data, 'entry_departure_airport'),
    toAirport: pickString(data, 'entry_airport'),
    flightNumber: pickString(data, 'entry_flight_number'),
    transport: pickString(data, 'entry_transport'),
  }
  if (hasAnyValue(outbound)) flights.push(outbound)

  if (ctx.tripType === 'round') {
    const inbound: FlightInfo = {
      direction: 'inbound',
      label: '귀국',
      date: pickString(data, 'return_date'),
      fromAirport: pickString(data, 'return_departure_airport'),
      toAirport: pickString(data, 'return_arrival_airport'),
      flightNumber: pickString(data, 'return_flight_number'),
      transport: pickString(data, 'return_transport'),
    }
    if (hasAnyValue(inbound)) flights.push(inbound)
  }

  return { guardian, pet, trip, flights }
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function pickString(data: Record<string, unknown>, key: string): string | null {
  const v = data[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function hasAnyValue(f: FlightInfo): boolean {
  return !!(f.date || f.fromAirport || f.toAirport || f.flightNumber || f.transport)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms =
    new Date(toIso + 'T00:00:00Z').getTime() -
    new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

/** 'YYYY-MM-DD' + 기준일 → 'NY MM' 형식. 1년 미만은 'NM' 만. */
function formatAge(birthIso: string, todayIso: string): string | null {
  const b = new Date(birthIso + 'T00:00:00Z')
  const t = new Date(todayIso + 'T00:00:00Z')
  if (isNaN(b.getTime()) || isNaN(t.getTime())) return null
  let years = t.getUTCFullYear() - b.getUTCFullYear()
  let months = t.getUTCMonth() - b.getUTCMonth()
  if (t.getUTCDate() < b.getUTCDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years <= 0 && months <= 0) return null
  if (years <= 0) return `${months}M`
  return `${years}Y ${months}M`
}
