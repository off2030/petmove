import { getDestinationOverride, EXTRA_FIELD_DEFS, normalizeTimeHhmm } from '@petmove/domain'
import type { Country } from './actions/extract-extra'

const SUPPORTED_COUNTRIES = new Set<Country>(['australia', 'new-zealand', 'philippines', 'thailand', 'usa', 'japan', 'hawaii', 'uk', 'switzerland', 'taiwan'])

export function extraExtractionDepartureDate(country: Country, unified: Record<string, string | null>): string | null {
  return (country === 'taiwan' ? unified.departure_flight_date : unified.entry_date) || null
}

/** destination → extractExtra Country 코드. extraSection 이 없으면 null. */
export function destinationToCountry(destination: string | null | undefined): Country | null {
  const override = getDestinationOverride(destination)
  const sec = override?.extraSection
  if (!sec) return null
  if (sec === 'new_zealand') return 'new-zealand'
  const country = sec as Country
  return SUPPORTED_COUNTRIES.has(country) ? country : null
}

/** AI 추출 결과(레거시 country-specific schema)를 통합 키로 매핑. */
export function mapExtractResultToUnified(country: Country, result: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  const set = (k: string, v: unknown) => {
    if (typeof v !== 'string' || !v) return
    // 시간 필드는 원문 표기가 그대로 온다 — 일본 검역소 예약 메일의 '1300' 처럼.
    // 저장 형식 HH:mm 으로 정규화하고, 못 읽는 값은 아예 넣지 않는다(깨진 시간보다 빈 칸).
    if (EXTRA_FIELD_DEFS[k]?.type === 'time') {
      const t = normalizeTimeHhmm(v)
      if (t) out[k] = t
      return
    }
    out[k] = v
  }
  if (country === 'japan') {
    const inb = (result.korea_to_japan ?? {}) as Record<string, unknown>
    const outb = (result.japan_to_korea ?? {}) as Record<string, unknown>
    // 일본 한일 노선: 출국일=도착일(같은 날) → korea_to_japan.date 는 departure_flight_date 로.
    // entry_date 는 일본에서 미사용. 출발시간(time)은 일본에서 불필요 → 미사용.
    set('departure_flight_date', inb.date)
    set('entry_departure_airport', inb.departure_airport)
    set('entry_airport', inb.arrival_airport)
    set('entry_transport', inb.transport)
    set('entry_flight_number', inb.flight_number)
    set('return_date', outb.date)
    set('return_departure_airport', outb.departure_airport)
    set('return_arrival_airport', outb.arrival_airport)
    set('return_transport', outb.transport)
    set('return_flight_number', outb.flight_number)
    // 일본 출국(수출)검역 예약 — 추가정보 '수출검역 예약' 그룹.
    set('jp_export_quarantine_date', result.export_quarantine_date)
    set('jp_export_quarantine_time', result.export_quarantine_time)
    set('email', result.email)
    set('address_overseas', result.address_overseas)
    set('certificate_no', result.certificate_no)
  } else if (country === 'usa') {
    set('passport_number', result.passport_number)
    set('holder_birth_date', result.birth_date)
    set('overseas_phone', result.us_phone)
    set('entry_date', result.arrival_date)
  } else if (country === 'thailand') {
    set('address_overseas', result.address_overseas)
    set('passport_number', result.passport_number)
    set('passport_expiry_date', result.passport_expiry_date)
    set('passport_issuer', result.passport_issuer)
    set('entry_flight_number', result.arrival_flight_number)
    set('entry_date', result.arrival_date)
    set('entry_time', result.arrival_time)
    // 태국은 검역소·도착지 = 입국공항. AI 가 추출한 quarantine_location(Bangkok/Phuket/Chiang Mai) 도 entry_airport 로 매핑.
    set('entry_airport', result.quarantine_location)
  } else if (country === 'philippines') {
    set('email', result.email)
    set('address_overseas', result.address_overseas)
    set('postal_code', result.postal_code)
    set('passport_number', result.passport_number)
    set('passport_expiry_date', result.passport_expiry_date)
    set('entry_airport', result.arrival_airport)
  } else if (country === 'hawaii') {
    set('passport_number', result.passport_number)
    set('passport_issuing_country', result.passport_issuing_country)
    set('passport_expiry_date', result.passport_expiry_date)
    set('holder_birth_date', result.date_of_birth)
    set('email', result.email_address)
    set('address_overseas', result.address_overseas)
    set('postal_code', result.postal_code)
    set('overseas_phone', result.phone)
    // 항공편은 노선 기반 슬롯 구조(2026-08-18). 예전엔 스칼라 4개(출국일·도착일·편명·
    // 도착시각)만 받아서 **출발/도착 공항이 통째로 비어 있었다**.
    //
    // ⚠️ **채우는 건 출국편(한국 → 하와이)뿐이다**(2026-08-18 사용자 지정). 귀국편은 추출
    //   결과를 쓰지 않는다 — return_* 칸은 운영자가 직접 확인해 넣는다.
    //   다만 추출 스키마의 hawaii_to_korea 슬롯은 **일부러 남겨 둔다**: 왕복 일정을 붙여
    //   넣었을 때 귀국편이 갈 자리가 없으면 모델이 '귀국 10/9'·'인천 10/10 도착'을 하와이
    //   도착일·도착시각으로 잘못 집어넣는다(원래 버그). 슬롯이 미끼 역할을 해 출국편
    //   추출이 정확해진다. 슬롯을 지우려면 그 오인식이 재발하는지 먼저 확인할 것.
    const hiIn = (result.korea_to_hawaii ?? {}) as Record<string, unknown>
    set('departure_flight_date', hiIn.date)
    set('entry_departure_airport', hiIn.departure_airport)
    set('entry_airport', hiIn.arrival_airport)
    set('entry_transport', hiIn.transport)
    set('entry_flight_number', hiIn.flight_number)
    // 하와이 도착일·도착시각은 별도 필드 — 날짜변경선 때문에 출발일과 같을 수 있어
    // 편의 date(출발일)로 대체하지 않는다.
    set('entry_date', result.entry_date)
    set('entry_time', result.arrival_time)
  } else if (country === 'switzerland') {
    set('entry_date', result.entry_date)
    set('entry_airport', result.entry_airport)
    set('email', result.email)
    set('entry_purpose', result.entry_purpose)
    set('cropped', result.cropped)
  } else if (country === 'australia') {
    set('permit_no', result.permit_no)
    set('id_date', result.id_date)
    // sample_received_date 는 flat 키가 아니라 rabies_titer_records[].received_date 로 들어간다.
    // → tryExtract 의 mergeTiterReceivedDate 가 처리. 여기서 set() 하면 안 됨(구 australia_extra 부활).
  } else if (country === 'new-zealand') {
    set('permit_no', result.permit_no)
    set('nz_importer_name', result.nz_importer_name)
    set('address_overseas', result.address_overseas)
    set('entry_airport', result.entry_airport)
  } else if (country === 'taiwan') {
    for (const key of ['permit_no', 'tw_permit_rabies_date', 'address_overseas', 'postal_code', 'overseas_phone', 'email', 'passport_number', 'entry_date']) {
      set(key, result[key])
    }
    const flight = (result.korea_to_taiwan ?? {}) as Record<string, unknown>
    set('departure_flight_date', flight.date)
    set('entry_departure_airport', flight.departure_airport)
    set('entry_airport', flight.arrival_airport)
    set('entry_transport', flight.transport)
    set('entry_flight_number', flight.flight_number)
  } else if (country === 'uk') {
    set('address_overseas', result.address_overseas)
  }
  return out
}

