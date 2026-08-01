// 케이스 정보 폼 — 공유 헬퍼.
// 원본: components/cases/info-view.tsx 의 readForm/eqForm/ageLabel/dDayLabel.
// /me/{guardian,animal,travel} sub-page 들이 같은 폼 패턴을 공유.

import type { CaseRow } from '@petmove/domain'
import { buildCaseJourneyContext, getTripType, parseDestinations, readByDestValue, todayKst } from '@petmove/domain'
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
  // 목적지 스코핑 필드(항공편·일본 수출검역) — by_dest[활성토큰] 우선으로 읽는다. 활성 토큰은
  // 저장(updateCaseInfoFields)과 동일하게 buildCaseJourneyContext 로 해석(?dest 없으면 첫 토큰).
  // 단일/legacy 는 top-level fallback, 다중은 strict(다른 목적지 값 누수 차단). 안 그러면 여정이
  // by_dest 로 저장한 값을 폼이 못 읽거나(다중), 폼이 top-level 로 저장한 값을 여정이 못 봄.
  const isMulti = parseDestinations(caseRow.destination).length > 1
  const token = buildCaseJourneyContext(caseRow).destinationToken
  const sScoped = (key: string): string => {
    if (token) {
      const v = readByDestValue(data, token, key)
      if (typeof v === 'string') return v
      if (v === null) return '' // 명시적 비움 — fallback 안 함
      if (isMulti) return '' // 다중 + by_dest 미존재 → strict 빈
    }
    return s(key) // 단일/legacy → top-level
  }
  // 영문 성·이름 — data 분리 필드(권위) 우선. 없으면 caseRow.customer_name_en 합본을
  // Last First 순서로 split fallback (admin pdf-fill 의 fallback 가정과 일관).
  // 새로 저장된 케이스는 항상 분리 필드를 갖게 되고, 옛 자유 입력 데이터만 fallback 을 탄다.
  let firstNameEn = s('customer_first_name_en')
  let lastNameEn = s('customer_last_name_en')
  if (!firstNameEn && !lastNameEn) {
    const composite = (caseRow.customer_name_en ?? '').trim()
    if (composite) {
      const parts = composite.split(/\s+/).filter(Boolean)
      lastNameEn = parts[0] ?? ''
      firstNameEn = parts.slice(1).join(' ')
    }
  }
  return {
    customer_name: caseRow.customer_name ?? '',
    customer_name_en: caseRow.customer_name_en ?? '',
    customer_first_name_en: firstNameEn,
    customer_last_name_en: lastNameEn,
    pet_name: caseRow.pet_name ?? '',
    pet_name_en: caseRow.pet_name_en ?? '',
    microchip: (caseRow.microchip ?? '').replace(/\D/g, ''),
    destination: caseRow.destination ?? '',
    departure_date: caseRow.departure_date ?? '',
    phone: s('phone').replace(/\D/g, ''),
    email: s('email'),
    address_kr: sFallback('address_kr', 'address_ko'),
    address_detail_kr: s('address_detail_kr'),
    address_zipcode: sFallback('address_zipcode', 'postal_code', 'zipcode'),
    address_en: sFallback('address_en', 'address_overseas'),
    birth_date: s('birth_date'),
    species: s('species'),
    breed: s('breed'),
    breed_en: s('breed_en'),
    color: s('color'),
    color_en: s('color_en'),
    sex: s('sex'),
    weight: s('weight'),
    trip_type: buildCaseJourneyContext(caseRow).tripType,
    co_progress: data.co_progress !== false,
    return_date: sScoped('return_date'),
    entry_departure_airport: sScoped('entry_departure_airport'),
    entry_airport: sScoped('entry_airport'),
    entry_flight_number: sScoped('entry_flight_number'),
    entry_transport: sScoped('entry_transport'),
    return_departure_airport: sScoped('return_departure_airport'),
    return_arrival_airport: sScoped('return_arrival_airport'),
    return_flight_number: sScoped('return_flight_number'),
    return_transport: sScoped('return_transport'),
    jp_export_quarantine_date: sScoped('jp_export_quarantine_date'),
    jp_export_quarantine_time: sScoped('jp_export_quarantine_time'),
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

/** 케이스의 보호자 식별 키 — 이름(trim) + 전화(숫자만). 형제 묶기 기준(DB 트리거와 동일). */
function guardianKey(c: CaseRow): { name: string; phone: string } {
  return {
    name: (c.customer_name ?? '').trim(),
    phone: String(((c.data ?? {}) as Record<string, unknown>).phone ?? '').replace(/\D/g, ''),
  }
}

/** 같은 보호자(이름+전화)의 다른 동물이 있는지 — 동시 진행 토글 노출 기준. */
export function hasSiblingCase(cases: CaseRow[], current: CaseRow): boolean {
  const g = guardianKey(current)
  if (!g.name || !g.phone) return false
  return cases.some((c) => {
    if (c.id === current.id) return false
    const cg = guardianKey(c)
    return cg.name === g.name && cg.phone === g.phone
  })
}

/**
 * 같은 보호자의 다른 동물 중, 같은 목적지(dest)로 가는 여정이 있는지.
 * '함께 준비' 토글을 목적지 카드별로 노출하는 기준 — 같은 곳으로 가는 형제가 있을 때만 노출.
 * (보호자에게 동물이 2마리 이상 + 같은 목적지 여정 존재 = 두 조건을 한 번에 충족.)
 */
export function hasSiblingForDestination(
  cases: CaseRow[],
  current: CaseRow,
  dest: string,
): boolean {
  const g = guardianKey(current)
  if (!g.name || !g.phone) return false
  const target = dest.trim()
  if (!target) return false
  // 조건 3 — 그 목적지의 왕복/편도가 형제와 일치해야 '같은 여정'. 다르면 함께 준비 노출 X.
  const myTrip = tripTypeForDest(current, target)
  return cases.some((c) => {
    if (c.id === current.id) return false
    const cg = guardianKey(c)
    if (cg.name !== g.name || cg.phone !== g.phone) return false
    const sharesDest = (c.destination ?? '')
      .split(',')
      .map((t) => t.trim())
      .includes(target)
    if (!sharesDest) return false
    return tripTypeForDest(c, target) === myTrip
  })
}

/** 케이스의 한 목적지 왕복/편도 — getTripType 위임(편도 전용 목적지 강제 포함). */
function tripTypeForDest(c: CaseRow, dest: string): 'round' | 'one_way' {
  return getTripType(c.data as Record<string, unknown> | null, dest)
}
