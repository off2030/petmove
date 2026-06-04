// 케이스 정보 폼 — 공유 헬퍼.
// 원본: components/cases/info-view.tsx 의 readForm/eqForm/ageLabel/dDayLabel.
// /me/{guardian,animal,travel} sub-page 들이 같은 폼 패턴을 공유.

import type { CaseRow } from '@petmove/domain'
import { buildCaseJourneyContext, todayKst } from '@petmove/domain'
import type { CaseInfoInput } from '@/lib/actions/cases'

/** caseRow → 편집 폼 state. data jsonb·컬럼을 모두 문자열 필드로 평탄화. */
export function readForm(caseRow: CaseRow): CaseInfoInput {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const s = (key: string): string => {
    const v = data[key]
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    return ''
  }
  const sFallback = (...keys: string[]): string => {
    for (const k of keys) {
      const v = s(k)
      if (v) return v
    }
    return ''
  }
  return {
    customer_name: caseRow.customer_name ?? '',
    customer_name_en: caseRow.customer_name_en ?? '',
    pet_name: caseRow.pet_name ?? '',
    pet_name_en: caseRow.pet_name_en ?? '',
    microchip: (caseRow.microchip ?? '').replace(/\D/g, ''),
    destination: caseRow.destination ?? '',
    departure_date: caseRow.departure_date ?? '',
    phone: s('phone').replace(/\D/g, ''),
    email: s('email'),
    address_kr: sFallback('address_kr', 'address_ko'),
    address_zipcode: sFallback('address_zipcode', 'postal_code', 'zipcode'),
    address_en: sFallback('address_en', 'address_overseas'),
    birth_date: s('birth_date'),
    species: s('species'),
    breed: s('breed'),
    color: s('color'),
    sex: s('sex'),
    weight: s('weight'),
    trip_type: buildCaseJourneyContext(caseRow).tripType,
    co_progress: data.co_progress !== false,
    return_date: s('return_date'),
    entry_departure_airport: s('entry_departure_airport'),
    entry_airport: s('entry_airport'),
    entry_flight_number: s('entry_flight_number'),
    entry_transport: s('entry_transport'),
    return_departure_airport: s('return_departure_airport'),
    return_arrival_airport: s('return_arrival_airport'),
    return_flight_number: s('return_flight_number'),
    return_transport: s('return_transport'),
    jp_export_quarantine_date: s('jp_export_quarantine_date'),
    jp_export_quarantine_time: s('jp_export_quarantine_time'),
  }
}

export function eqForm(a: CaseInfoInput, b: CaseInfoInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}


/** 출국일 → D-7 / D-DAY / D+3. */
export function dDayLabel(departureIso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureIso)) return undefined
  const today = new Date(todayKst() + 'T00:00:00')
  const dep = new Date(departureIso + 'T00:00:00')
  const diff = Math.round((dep.getTime() - today.getTime()) / 86_400_000)
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-DAY'
  return `D+${-diff}`
}

/** 생년월일 → '연령 3세 2개월'. */
export function ageLabel(birthIso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return undefined
  const b = new Date(birthIso + 'T00:00:00')
  const t = new Date(todayKst() + 'T00:00:00')
  if (isNaN(b.getTime())) return undefined
  let years = t.getFullYear() - b.getFullYear()
  let months = t.getMonth() - b.getMonth()
  if (t.getDate() < b.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years <= 0 && months <= 0) return undefined
  if (years <= 0) return `연령 ${months}개월`
  return `연령 ${years}세 ${months}개월`
}

/** 같은 보호자(이름+전화)의 다른 동물이 있는지 — 동시 진행 토글 노출 기준. */
export function hasSiblingCase(cases: CaseRow[], current: CaseRow): boolean {
  const name = (current.customer_name ?? '').trim()
  const phone = String(
    ((current.data ?? {}) as Record<string, unknown>).phone ?? '',
  ).replace(/\D/g, '')
  if (!name || !phone) return false
  return cases.some(
    (c) =>
      c.id !== current.id &&
      (c.customer_name ?? '').trim() === name &&
      String(((c.data ?? {}) as Record<string, unknown>).phone ?? '').replace(/\D/g, '') === phone,
  )
}
