'use server'

import OpenAI from 'openai'
import { reportActionError } from './_report-error'
import { EXTRACTION_MODEL } from '@/lib/openai-config'

/* ─────────────────────────── Types ─────────────────────────── */

export type Country =
  | 'australia' | 'new-zealand' | 'philippines' | 'thailand' | 'usa'
  | 'japan' | 'hawaii' | 'uk' | 'switzerland'

export interface FlightEntry {
  date: string | null
  time: string | null
  departure_airport: string | null
  arrival_airport: string | null
  transport: 'Checked-baggage' | 'Carry-on' | 'Cargo' | 'Cargo(Sea)' | null
  flight_number: string | null
}

export interface AustraliaResult {
  permit_no: string | null
  id_date: string | null
  sample_received_date: string | null
}

export interface NewZealandResult {
  permit_no: string | null
}

export interface PhilippinesResult {
  email: string | null
  address_overseas: string | null
  postal_code: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  arrival_airport: string | null
}

export interface ThailandResult {
  address_overseas: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  passport_issuer: string | null
  arrival_flight_number: string | null
  arrival_date: string | null
  arrival_time: string | null
  quarantine_location: 'Bangkok' | 'Phuket' | 'Chiang Mai' | null
}

export interface UsaResult {
  passport_number: string | null
  birth_date: string | null
  us_phone: string | null
  arrival_date: string | null
}

export interface JapanResult {
  /** 한국 → 일본 출국편. (구 'inbound' — 한국어 출국/입국 라벨과 반대라 모델이 뒤바꿔 개명) */
  korea_to_japan: FlightEntry
  /** 일본 → 한국 귀국편. (구 'outbound') */
  japan_to_korea: FlightEntry
  /** 일본 출국(수출)검역 예약 — 일본 동물검역소에서 귀국 전 받는 검역. */
  export_quarantine_date: string | null
  export_quarantine_time: string | null
  email: string | null
  address_overseas: string | null
  certificate_no: string | null
}

export interface HawaiiResult {
  passport_number: string | null
  passport_issuing_country: string | null
  passport_expiry_date: string | null
  date_of_birth: string | null
  email_address: string | null
  address_overseas: string | null
  postal_code: string | null
  phone: string | null
  /** 한국 → 하와이 출국편. (일본과 같은 노선 기반 슬롯 — 날짜 순서로 배정하지 않는다) */
  korea_to_hawaii: FlightEntry
  /**
   * 하와이 → 한국 귀국편.
   * ⚠️ 케이스 필드에 **반영하지 않는다**(2026-08-18 사용자 지정 — 귀국편은 운영자 입력).
   * 그래도 슬롯을 받는 이유: 왕복 일정을 붙여 넣었을 때 귀국편이 갈 자리가 없으면 모델이
   * 귀국 날짜·인천 도착 시각을 하와이 도착 정보로 잘못 넣는다. 미끼 슬롯이다.
   */
  hawaii_to_korea: FlightEntry
  /** 하와이 도착일 — 날짜변경선 때문에 출발일과 같을 수도, 하루 빠를 수도 있다. */
  entry_date: string | null
  /** 하와이 도착 시각(24h). 인천 도착 시각이 아니다. */
  arrival_time: string | null
}

export interface UkResult {
  address_overseas: string | null
}

export interface SwitzerlandResult {
  entry_date: string | null
  entry_airport: 'zurich' | 'geneva' | 'basel' | null
  address_overseas: string | null
  email: string | null
}

export interface ResultMap {
  australia: AustraliaResult
  'new-zealand': NewZealandResult
  philippines: PhilippinesResult
  thailand: ThailandResult
  usa: UsaResult
  japan: JapanResult
  hawaii: HawaiiResult
  uk: UkResult
  switzerland: SwitzerlandResult
}

type ExtractInput<C extends Country> = {
  country: C
  images?: { base64: string; mediaType: string }[]
  text?: string
}

type ExtractResult<C extends Country> =
  | { ok: true; data: ResultMap[C] }
  | { ok: false; error: string }

/* ─────────────────── Schemas (JSON schema) ─────────────────── */

const FLIGHT_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'time', 'departure_airport', 'arrival_airport', 'transport', 'flight_number'],
  properties: {
    date: { type: ['string', 'null'] },
    time: { type: ['string', 'null'] },
    departure_airport: { type: ['string', 'null'] },
    arrival_airport: { type: ['string', 'null'] },
    transport: {
      type: ['string', 'null'],
      enum: ['Checked-baggage', 'Carry-on', 'Cargo', 'Cargo(Sea)', null],
    },
    flight_number: { type: ['string', 'null'] },
  },
} as const

function nullable(extra: Record<string, unknown> = {}) {
  return { type: ['string', 'null'], ...extra }
}

const SCHEMAS: { [C in Country]: Record<string, unknown> } = {
  australia: {
    type: 'object',
    additionalProperties: false,
    required: ['permit_no', 'id_date', 'sample_received_date'],
    properties: {
      permit_no: nullable(),
      id_date: nullable(),
      sample_received_date: nullable(),
    },
  },
  'new-zealand': {
    type: 'object',
    additionalProperties: false,
    required: ['permit_no'],
    properties: { permit_no: nullable() },
  },
  philippines: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'address_overseas', 'postal_code', 'passport_number', 'passport_expiry_date', 'arrival_airport'],
    properties: {
      email: nullable(),
      address_overseas: nullable(),
      postal_code: nullable(),
      passport_number: nullable(),
      passport_expiry_date: nullable(),
      arrival_airport: nullable(),
    },
  },
  thailand: {
    type: 'object',
    additionalProperties: false,
    required: [
      'address_overseas', 'passport_number', 'passport_expiry_date', 'passport_issuer',
      'arrival_flight_number', 'arrival_date', 'arrival_time', 'quarantine_location',
    ],
    properties: {
      address_overseas: nullable(),
      passport_number: nullable(),
      passport_expiry_date: nullable(),
      passport_issuer: nullable(),
      arrival_flight_number: nullable(),
      arrival_date: nullable(),
      arrival_time: nullable(),
      quarantine_location: {
        type: ['string', 'null'],
        enum: ['Bangkok', 'Phuket', 'Chiang Mai', null],
      },
    },
  },
  usa: {
    type: 'object',
    additionalProperties: false,
    required: ['passport_number', 'birth_date', 'us_phone', 'arrival_date'],
    properties: {
      passport_number: nullable(),
      birth_date: nullable(),
      us_phone: nullable(),
      arrival_date: nullable(),
    },
  },
  japan: {
    type: 'object',
    additionalProperties: false,
    required: ['korea_to_japan', 'japan_to_korea', 'export_quarantine_date', 'export_quarantine_time', 'email', 'address_overseas', 'certificate_no'],
    properties: {
      korea_to_japan: FLIGHT_ENTRY_SCHEMA,
      japan_to_korea: FLIGHT_ENTRY_SCHEMA,
      export_quarantine_date: nullable(),
      export_quarantine_time: nullable(),
      email: nullable(),
      address_overseas: nullable(),
      certificate_no: nullable(),
    },
  },
  hawaii: {
    type: 'object',
    additionalProperties: false,
    required: [
      'passport_number', 'passport_issuing_country', 'passport_expiry_date',
      'date_of_birth', 'email_address', 'address_overseas', 'postal_code',
      'phone', 'korea_to_hawaii', 'hawaii_to_korea', 'entry_date', 'arrival_time',
    ],
    properties: {
      passport_number: nullable(),
      passport_issuing_country: nullable(),
      passport_expiry_date: nullable(),
      date_of_birth: nullable(),
      email_address: nullable(),
      address_overseas: nullable(),
      postal_code: nullable(),
      phone: nullable(),
      korea_to_hawaii: FLIGHT_ENTRY_SCHEMA,
      hawaii_to_korea: FLIGHT_ENTRY_SCHEMA,
      entry_date: nullable(),
      arrival_time: nullable(),
    },
  },
  uk: {
    type: 'object',
    additionalProperties: false,
    required: ['address_overseas'],
    properties: { address_overseas: nullable() },
  },
  switzerland: {
    type: 'object',
    additionalProperties: false,
    required: ['entry_date', 'entry_airport', 'address_overseas', 'email'],
    properties: {
      entry_date: nullable(),
      entry_airport: {
        type: ['string', 'null'],
        enum: ['zurich', 'geneva', 'basel', null],
      },
      address_overseas: nullable(),
      email: nullable(),
    },
  },
}

/* ─────────────────── System prompts per country ─────────────────── */

const COMMON_RULES = `
- Dates MUST be ISO format YYYY-MM-DD. Convert any format (e.g. '05 JUL 2026', '2026/07/05', '05.07.2026').
- For any field not present in the input, return null.
- For passport_number fields: the alphanumeric code next to "여권번호/Passport No.". Korean passports start with a letter (M/S/R/DP/O/TP) followed by 8 digits. Do NOT read the MRZ (bottom '<<<' lines).
- address_overseas: destination address overseas, in English. Romanize Japanese/Thai/Korean if needed. Include postal code if visible (unless a separate postal_code field is requested, in which case exclude it).
- Return ONLY valid JSON matching the schema — no markdown, no explanation.
`

const PROMPTS: { [C in Country]: string } = {
  australia: `You extract Australia-specific pet-import fields from images or text.${COMMON_RULES}
- permit_no: Australian import permit number. Extract whatever value follows labels like "Permit", "Permit No.", "Permit Number", "Import Permit", "허가번호". Formats vary (pure digits, alphanumeric, hyphenated). Do NOT reject unusual formats.
- id_date: "Identity verification date" / "ID verification" / "마이크로칩 확인일" — 180-day ID check date before export. YYYY-MM-DD.
- sample_received_date: Date RNATT blood sample was RECEIVED at the testing laboratory ("접수일", "접수일자", "검체접수일", "수령일", "샘플수령일", "도착일", "Date received", "Sample received", "arrived at laboratory" — 검사기관마다 표기가 다르다: APQA/검역본부="접수일", KRSL/코미팜="샘플 수령일"). NOT the collection/draw date. YYYY-MM-DD.`,

  'new-zealand': `You extract New Zealand import permit info from images or text.${COMMON_RULES}
- permit_no: NZ MPI "Permit to Import" number. Look for labels like "Permit Number", "Permit No", "Permit", or the alphanumeric code in the header (e.g. "D2605783C", "2024/123456").`,

  philippines: `You extract Philippines pet-import entry fields from images or text.${COMMON_RULES}
- email: Any email address in the input.
- address_overseas: Destination address in the Philippines, in English. EXCLUDE postal code (separate field).
- postal_code: Postal/ZIP code of the Philippine address.
- passport_number: See common rules.
- passport_expiry_date: Passport EXPIRY date ("기간만료일" / "Date of expiry"), YYYY-MM-DD.
- arrival_airport: Philippine arrival airport IATA code (MNL, CEB, DVO, etc.) or city name → IATA.`,

  thailand: `You extract Thailand pet-import entry fields from images or text.${COMMON_RULES}
- address_overseas: Destination address in Thailand, in English.
- passport_number: See common rules.
- passport_expiry_date: YYYY-MM-DD.
- passport_issuer: Passport issuing authority (발행관청/Authority). For Korean passports: "MINISTRY OF FOREIGN AFFAIRS". Copy English text as printed.
- arrival_flight_number: Flight number arriving in Thailand (e.g. "KE659", "TG659").
- arrival_date: Date the pet arrives in Thailand, YYYY-MM-DD.
- arrival_time: Arrival time in 24h format "HH:mm".
- quarantine_location: One of "Bangkok" | "Phuket" | "Chiang Mai" based on the arrival airport:
  - BKK, DMK → "Bangkok"; HKT → "Phuket"; CNX → "Chiang Mai"
  - Also city names: Bangkok/방콕 → "Bangkok", Phuket/푸켓 → "Phuket", Chiang Mai/치앙마이 → "Chiang Mai".
  - If arrival airport is in Thailand, ALWAYS populate quarantine_location.`,

  usa: `You extract USA pet-import / traveler fields from images or text.${COMMON_RULES}
- passport_number: See common rules.
- birth_date: Holder's date of birth ("생년월일" / "Date of birth"), YYYY-MM-DD.
- us_phone: US phone number, preferably in "+1-..." format (e.g. "+1-213-555-0199"). If only a raw number like "213-555-0199" is present, prefix with "+1-". Accept any clearly US-style phone.
- arrival_date: Date of arrival in the USA, YYYY-MM-DD. If a flight itinerary is present, this is the Korea→USA (outgoing-from-Korea) flight's arrival date.`,

  japan: `You extract Japan round-trip flight info plus address/email/EQC from images or text.
The customer transports a pet between Korea and Japan — typically TWO flights:
1. "korea_to_japan" = the flight that DEPARTS a Korean airport (ICN/GMP/PUS/CJU) and ARRIVES at a Japanese airport (NRT/HND/KIX/CTS/FUK/OKA).
2. "japan_to_korea" = the reverse (departs Japan, arrives Korea).
Assign each flight to its slot by its ROUTE (airports) — never by date order or the order flights appear.
Korean labels (the input is written from the Korean traveler's perspective):
  출국 / 출발 / 가는 편 → korea_to_japan; 입국 / 귀국 / 오는 편 → japan_to_korea.
Route notation "A-B", "A→B", "A발 B행" means departure_airport=A, arrival_airport=B. Keep each airport with its own flight and slot — NEVER copy the same airport into both departure and arrival.
Worked example — input:
  "(출국) 2026/09/22 KE791 / 인천(ICN)-후쿠오카(FUK)  (입국) 2026/09/28 KE792 / 후쿠오카(FUK)-인천(ICN)"
→ korea_to_japan: { date: "2026-09-22", flight_number: "KE791", departure_airport: "ICN", arrival_airport: "FUK" }
→ japan_to_korea: { date: "2026-09-28", flight_number: "KE792", departure_airport: "FUK", arrival_airport: "ICN" }${COMMON_RULES}
- For each flight: date (YYYY-MM-DD), time (24h "HH:mm"), departure_airport (IATA), arrival_airport (IATA), transport, flight_number.
- time: scheduled DEPARTURE time of that flight in 24h "HH:mm". Convert AM/PM if needed (e.g. "9:30 AM" → "09:30", "5:45 PM" → "17:45"). If only an arrival time is shown, return null.
- transport: exactly one of "Checked-baggage" | "Carry-on" | "Cargo" | "Cargo(Sea)". NEVER null — default "Carry-on" when unclear.
  Korean mappings: 기내탑승/기내동반/cabin → "Carry-on"; 수하물/수화물/화물칸/baggage/checked → "Checked-baggage"; 화물/cargo → "Cargo"; 선박/sea → "Cargo(Sea)".
  In Q&A format, ONLY use the ANSWER (after colon), not the question choices.
  If transport given for one flight but not the other, apply the same to both.
- If only one flight is found, put it in "korea_to_japan" if it departs Korea, or "japan_to_korea" if it departs Japan; leave the other all nulls.
- export_quarantine_date / export_quarantine_time: appointment for the JAPAN-side export quarantine inspection — done at a Japanese Animal Quarantine Service (動物検疫所) counter before the pet returns to Korea. Korean labels: "일본 출국 검역", "일본 수출검역", "출국검역 예약", "검역 예약". Date YYYY-MM-DD (infer year as the next upcoming if missing), time 24h "HH:mm" (e.g. "오후 1시 30분" → "13:30"; if only a vague time like "오후" is given, return null time).
  ONLY extract when the quarantine clearly happens in JAPAN (mentions 일본, a Japanese airport, or the return trip). If it refers to the KOREAN departure quarantine at ICN before flying to Japan, return null for both.
- email: any email address in the input.
- address_overseas: destination address in Japan, in English. Romanize Japanese if needed.
- certificate_no: Export Quarantine Certificate number (수출검역증명서/輸出検疫証明書 / 検疫証明書番号) if present.
- IMPORTANT: If the image is ONLY an Export Quarantine Certificate, extract certificate_no only and set flight fields to null (the cert contains old trip data).`,

  hawaii: `You extract Hawaii round-trip flight info plus passport/address fields from images or text.
The customer transports a pet between Korea and Hawaii — typically TWO flights:
1. "korea_to_hawaii" = the flight that DEPARTS a Korean airport (ICN/GMP/PUS/CJU) and ARRIVES in Hawaii (HNL/OGG/KOA/LIH).
2. "hawaii_to_korea" = the flight that DEPARTS Hawaii and ARRIVES at a Korean airport.
Assign each flight to its slot by its ROUTE (airports) — never by date order or the order flights appear.
Korean labels: "출국"/"가는 편" = korea_to_hawaii, "귀국"/"오는 편"/"복귀" = hawaii_to_korea. Trust the AIRPORTS over the label if they disagree.
Route notation "A-B", "A→B", "A발 B행", "인천(ICN) 22:10 출발 → 호놀룰루(HNL) 12:20 도착" means departure_airport=A, arrival_airport=B. Keep each airport with its own flight and slot — NEVER copy the same airport into both departure and arrival.
Example input: "출국: 2026년 10월 4일 인천(ICN) 22:10 출발 → 호놀룰루(HNL) 12:20 도착 / 귀국: 2026년 10월 9일 호놀룰루(HNL) 14:20 출발 → 2026년 10월 10일 인천(ICN) 19:05 도착"
→ korea_to_hawaii: { date: "2026-10-04", time: "22:10", departure_airport: "ICN", arrival_airport: "HNL" }
→ hawaii_to_korea: { date: "2026-10-09", time: "14:20", departure_airport: "HNL", arrival_airport: "ICN" }
→ entry_date: "2026-10-04", arrival_time: "12:20"${COMMON_RULES}
- passport_number: FULL passport number as written (e.g. "M218A9542"). Korean passports start with a letter (M/S/R/DP/O/TP) followed by 8 digits. Do NOT truncate or take only last 4 digits — always return the full number.
- passport_issuing_country: Issuing country full English name (e.g. "Republic of Korea"). Map codes like KOR → "Republic of Korea". Korean labels: "발행국가", "국적", "Issuing Country", "Nationality".
- passport_expiry_date: Passport EXPIRY date ("기간만료일" / "Date of expiry"), YYYY-MM-DD. NOT date of issue.
- date_of_birth: Holder's DATE OF BIRTH ("생년월일" / "소유주 생년월일" / "Date of birth"), YYYY-MM-DD. If only YYMMDD (e.g. "930120"), expand: years 30-99 → 19xx, years 00-29 → 20xx.
- email_address: Email address.
- address_overseas: Hawaii address in English (street + city + state). EXCLUDE the ZIP code — if the address line ends with a ZIP (e.g. "2005 Kalia Rd, Honolulu, HI 96815"), return "2005 Kalia Rd, Honolulu, HI" here and put "96815" in postal_code.
- postal_code: ZIP code only (e.g. "96815"). Always fill it when the address contains one.
- phone: Holder's phone number for Hawaii entry. Accept any format the user wrote — international ("+1-808-555-0199"), digits only ("18085550199" or "8085550199"), with separators. Return as written, do not reformat.
- For each flight: date (YYYY-MM-DD), time (24h "HH:mm"), departure_airport (IATA), arrival_airport (IATA), transport, flight_number.
- date: the DEPARTURE date of that flight (the date the flight takes off), not the arrival date. For hawaii_to_korea this is the date it leaves Hawaii — Korea arrival is usually the NEXT day, and that later date must NOT be used.
- time: scheduled DEPARTURE time of that flight in 24h "HH:mm". Convert AM/PM if needed ("9:30 AM" → "09:30", "5:45 PM" → "17:45").
- flight_number: that flight's own number (e.g. "KE053", "HA458"). If a leg has no number shown, null.
- transport: how the pet travels ("위탁수하물"/"화물칸 위탁" → "Checked-baggage", "기내"/"기내동반" → "Carry-on", "화물"/"카고" → "Cargo", "해상" → "Cargo(Sea)").
  ONLY when the text actually says how the pet travels — never infer it from the airline or the aircraft. If nothing is said, return null.
  If transport is given for one flight but not the other, apply the same value to both.
- If only one flight is found, put it in the slot its route matches and leave the other all nulls.
- Always fill hawaii_to_korea when a return flight is present, even though only the outbound leg is used downstream — it keeps return-trip dates out of the Hawaii arrival fields.
- entry_date: date the pet ARRIVES in Hawaii, YYYY-MM-DD. Korea→Hawaii crosses the date line eastbound, so the Hawaii arrival is usually the SAME calendar day as the Korean departure (a 22:10 ICN departure lands 12:20 the same day). Use the date printed next to the Hawaii arrival if one is shown; otherwise use korea_to_hawaii.date. NEVER use a date from the return trip, and never use the Incheon arrival date.
- arrival_time: scheduled ARRIVAL time IN HAWAII, 24h "HH:mm" (the time next to the HNL/OGG/KOA/LIH arrival). Do NOT use the Korea arrival time of the return flight. If no Hawaii arrival time is shown, return null.
- CRITICAL — if a year is missing (e.g. just "10/4" or "Oct 4"): output the next upcoming occurrence AFTER today's date. NEVER output a year in the past.`,

  uk: `You extract the overseas destination address for UK pet-import from images or text.${COMMON_RULES}
- address_overseas: UK destination address in English, including postal code if visible. Return null if no address found.`,

  switzerland: `You extract Switzerland pet-import entry fields from images or text.${COMMON_RULES}
- entry_date: Date of entry into Switzerland, YYYY-MM-DD. If a flight itinerary is present, this is the arrival date in Switzerland.
- entry_airport: One of "zurich" | "geneva" | "basel" based on arrival airport:
  - ZRH / Zürich / Zurich / 취리히 → "zurich"
  - GVA / Geneva / Genève / 제네바 → "geneva"
  - BSL / Basel / 바젤 → "basel"
  - If Swiss airport not found, null.
- address_overseas: Swiss destination address in English, format "Street Name + Number, Postcode City, Switzerland" (include postal code).
- email: Any email address in the input.`,
}

/* ─────────────────── Dispatcher ─────────────────── */

export async function extractExtra<C extends Country>(input: ExtractInput<C>): Promise<ExtractResult<C>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not configured' }
  if (!input.images?.length && !input.text) return { ok: false, error: 'No input provided' }

  const client = new OpenAI({ apiKey })

  try {
    const userContent: OpenAI.ChatCompletionContentPart[] = []
    if (input.images) {
      for (const img of input.images) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
        })
      }
    }
    userContent.push({
      type: 'text',
      text: input.text
        ? `Extract the information from this text:\n\n${input.text}`
        : 'Extract the information from the image(s) above.',
    })

    const today = new Date().toISOString().slice(0, 10)
    const systemContent = `Today is ${today} (UTC). When inferring missing year/date components, prefer the next upcoming date — never a past date.\n\n${PROMPTS[input.country]}`

    const response = await client.chat.completions.create(
      {
        model: EXTRACTION_MODEL,
        max_tokens: 800,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: `${input.country.replace('-', '_')}_extract`,
            strict: true,
            schema: SCHEMAS[input.country],
          },
        },
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
      },
      { timeout: 30_000, maxRetries: 1 },
    )

    const text = response.choices[0]?.message?.content ?? ''
    const parsed = sanitizeBlanks(JSON.parse(text) as ResultMap[C])

    if (!hasAnyValue(parsed)) return { ok: false, error: 'No information found' }
    return { ok: true, data: parsed }
  } catch (err) {
    const reported = reportActionError(err, 'extract-extra.extractExtra')
    const msg = err instanceof Error ? reported : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * 모델이 값 대신 돌려주는 **문자열 'null'** 같은 가짜 값을 진짜 null 로 바꾼다.
 * (gpt-4o-mini 가 time 칸에 "null" 을 넣어 화면에 그대로 찍히던 사례 — 2026-08-18)
 * 중첩 객체(항공편 슬롯)까지 재귀 적용.
 */
const BLANK_TOKENS = new Set(['null', 'none', 'n/a', 'na', '-', '없음', '미정', 'unknown'])
function sanitizeBlanks<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string') {
      const t = v.trim()
      out[k] = t === '' || BLANK_TOKENS.has(t.toLowerCase()) ? null : t
    } else if (v && typeof v === 'object') {
      out[k] = sanitizeBlanks(v)
    } else {
      out[k] = v
    }
  }
  return out as T
}

function hasAnyValue(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return true
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (hasAnyValue(v)) return true
  }
  return false
}
