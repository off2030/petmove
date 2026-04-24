'use server'

import OpenAI from 'openai'
import { EXTRACTION_MODEL } from '@/lib/openai-config'

/* ─────────────────────────── Types ─────────────────────────── */

export type Country =
  | 'australia' | 'new-zealand' | 'philippines' | 'thailand' | 'usa'
  | 'japan' | 'hawaii' | 'uk' | 'switzerland'

export interface FlightEntry {
  date: string | null
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
  inbound: FlightEntry
  outbound: FlightEntry
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
  required: ['date', 'departure_airport', 'arrival_airport', 'transport', 'flight_number'],
  properties: {
    date: { type: ['string', 'null'] },
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
    required: ['inbound', 'outbound', 'email', 'address_overseas', 'certificate_no'],
    properties: {
      inbound: FLIGHT_ENTRY_SCHEMA,
      outbound: FLIGHT_ENTRY_SCHEMA,
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
    ],
    properties: {
      passport_number: nullable(),
      passport_issuing_country: nullable(),
      passport_expiry_date: nullable(),
      date_of_birth: nullable(),
      email_address: nullable(),
      address_overseas: nullable(),
      postal_code: nullable(),
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
- sample_received_date: Date RNATT blood sample was RECEIVED at the testing laboratory ("Date received", "Sample received", "수령일", "도착일", "arrived at laboratory"). NOT the collection/draw date. YYYY-MM-DD.`,

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
1. "inbound" = Korea → Japan (departing Korean airport ICN/GMP/PUS/CJU; arriving Japanese airport NRT/HND/KIX/CTS/FUK/OKA).
2. "outbound" = Japan → Korea (reverse).
Determine direction BY AIRPORTS, not by date order.${COMMON_RULES}
- For each flight: date (YYYY-MM-DD), departure_airport (IATA), arrival_airport (IATA), transport, flight_number.
- transport: exactly one of "Checked-baggage" | "Carry-on" | "Cargo" | "Cargo(Sea)". NEVER null — default "Carry-on" when unclear.
  Korean mappings: 기내탑승/기내동반/cabin → "Carry-on"; 수하물/수화물/화물칸/baggage/checked → "Checked-baggage"; 화물/cargo → "Cargo"; 선박/sea → "Cargo(Sea)".
  In Q&A format, ONLY use the ANSWER (after colon), not the question choices.
  If transport given for one flight but not the other, apply the same to both.
- If only one flight is found, put it in "inbound" and leave "outbound" all nulls.
- email: any email address in the input.
- address_overseas: destination address in Japan, in English. Romanize Japanese if needed.
- certificate_no: Export Quarantine Certificate number (수출검역증명서/輸出検疫証明書 / 検疫証明書番号) if present.
- IMPORTANT: If the image is ONLY an Export Quarantine Certificate, extract certificate_no only and set flight fields to null (the cert contains old trip data).`,

  hawaii: `You extract Hawaii entry form fields from images or text.${COMMON_RULES}
- passport_number: LAST 4 DIGITS only (e.g. "M12345678" → "5678"). Never the full number.
- passport_issuing_country: Issuing country full English name (e.g. "Republic of Korea"). Map codes like KOR → "Republic of Korea".
- passport_expiry_date: Passport EXPIRY date ("기간만료일" / "Date of expiry"), YYYY-MM-DD. NOT date of issue.
- date_of_birth: Holder's DATE OF BIRTH ("생년월일" / "Date of birth"), YYYY-MM-DD.
- email_address: Email address.
- address_overseas: Overseas address in English (street + city + state if present). EXCLUDE postal code.
- postal_code: Postal/ZIP code.`,

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

    const response = await client.chat.completions.create({
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
        { role: 'system', content: PROMPTS[input.country] },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(text) as ResultMap[C]

    if (!hasAnyValue(parsed)) return { ok: false, error: 'No information found' }
    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

function hasAnyValue(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return true
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (hasAnyValue(v)) return true
  }
  return false
}
