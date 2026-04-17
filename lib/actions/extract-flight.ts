'use server'

import OpenAI from 'openai'

export interface FlightEntry {
  date: string | null
  departure_airport: string | null
  arrival_airport: string | null
  transport: string | null
  flight_number: string | null
}

export interface FlightExtractResult {
  inbound: FlightEntry
  outbound: FlightEntry
  address_overseas: string | null
  certificate_no: string | null
  /** Passport info */
  passport_issue_date: string | null
  passport_expiry_date: string | null
  passport_nationality: string | null
  passport_number: string | null
  /** Address postal code */
  postal_code: string | null
  /** Email address */
  email: string | null
  /** Thailand arrival details */
  arrival_time: string | null  // HH:mm
  quarantine_location: string | null  // "방콕" | "푸켓" | "치앙마이" | null
  /** Australia-specific fields */
  au_permit_no: string | null
  au_id_date: string | null  // YYYY-MM-DD
  au_sample_received_date: string | null  // YYYY-MM-DD
  /** New Zealand permit */
  nz_permit_no: string | null
}

type ExtractResult =
  | { ok: true; data: FlightExtractResult }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract flight/travel information from images or text.
The user is transporting a pet between Korea and Japan. There are typically TWO flights:
1. "inbound" = Korea → Japan (departing Korea, arriving Japan). The departure airport is Korean (ICN, GMP, PUS, CJU etc.) and the arrival airport is Japanese (NRT, HND, KIX, CTS, FUK, OKA etc.)
2. "outbound" = Japan → Korea (departing Japan, arriving Korea). The departure airport is Japanese and the arrival airport is Korean.
IMPORTANT: Determine direction by the airports, not by the date order.

Return ONLY a JSON object:
{
  "inbound": {
    "date": "YYYY-MM-DD",
    "departure_airport": "IATA code",
    "arrival_airport": "IATA code",
    "transport": "Checked-baggage or Carry-on or Cargo or Cargo(Sea) or null",
    "flight_number": "e.g. KE713"
  },
  "outbound": {
    "date": "YYYY-MM-DD",
    "departure_airport": "IATA code",
    "arrival_airport": "IATA code",
    "transport": "Checked-baggage or Carry-on or Cargo or Cargo(Sea) or null",
    "flight_number": "e.g. KE714"
  },
  "address_overseas": "Destination address overseas in English, or null",
  "certificate_no": "Export quarantine certificate number if found, else null",
  "passport_issue_date": "YYYY-MM-DD or null",
  "passport_expiry_date": "YYYY-MM-DD or null",
  "passport_nationality": "Nationality in English (e.g. Republic of Korea, USA) or null",
  "passport_number": "Passport number or null",
  "postal_code": "Postal/ZIP code of the overseas address or null",
  "email": "Email address if present or null",
  "arrival_time": "HH:mm (24h) or null",
  "quarantine_location": "Bangkok or Phuket or Chiang Mai or null",
  "au_permit_no": "Australia import permit number (e.g. IP-2026-ABC-0099) or null",
  "au_id_date": "Australia ID verification date, YYYY-MM-DD, or null",
  "au_sample_received_date": "Date the RNATT blood sample arrived at the testing laboratory, YYYY-MM-DD, or null",
  "nz_permit_no": "New Zealand import permit number (e.g. D2605783C, 2024/123456) or null"
}

Rules:
- Dates must be YYYY-MM-DD. If year is missing, assume nearest future date.
- Airports must be IATA 3-letter codes. Convert city/airport names to codes.
- transport must be exactly one of: "Checked-baggage", "Carry-on", "Cargo", "Cargo(Sea)", or null.
  Korean mappings: 기내탑승/cabin/기내 → "Carry-on", 수하물/수화물/화물칸/수하물칸/수화물칸/baggage → "Checked-baggage", 화물/cargo → "Cargo", 선박/sea → "Cargo(Sea)".
- Use null for any field not found.
- If only one flight is found, put it in "inbound" and leave "outbound" all nulls.
- If transport is found for one flight but not the other, apply the same transport to both.
- If the input is not flight related, return all nulls for both.
- address_overseas: destination address overseas, in English. Romanize Japanese/Thai/Korean if needed. Include postal code if visible.
- passport fields: extract from passport images/text. Dates in YYYY-MM-DD. Nationality as full country name in English. passport_number as the alphanumeric code on the passport.
- postal_code: extract if present in the overseas address (ZIP code in US, 郵便番号 in Japan, etc.).
- email: any email address in the input.
- arrival_time: 24-hour format "HH:mm", from flight arrival time (not departure).
- quarantine_location: ALWAYS set this when the arrival airport is in Thailand, by mapping the IATA code:
  - BKK, DMK → "Bangkok"
  - HKT → "Phuket"
  - CNX → "Chiang Mai"
  Also accept city names: Bangkok/방콕/กรุงเทพ → "Bangkok", Phuket/푸켓/ภูเก็ต → "Phuket", Chiang Mai/치앙마이/เชียงใหม่ → "Chiang Mai".
  If the inbound flight's arrival_airport is one of these codes/cities, quarantine_location MUST be populated even if not explicitly mentioned.
- IMPORTANT: If the image is an Export Quarantine Certificate (수출검역증명서/輸出検疫証明書), ONLY extract the certificate number (検疫証明書番号/Certificate No.). Do NOT extract flight info from this document — it contains old travel data, not the current trip. Set all flight fields to null.
- Australia-specific extraction (applies whenever an Australian document is present, even if it's also a permit page):
  - au_permit_no: Australian import permit number. Extract whatever value follows any of these labels, verbatim, including pure digits: "Permit", "Permit:", "Permit No.", "Permit Number", "Import Permit", "Import Permit No.", "허가번호". Formats vary widely — may be pure digits (e.g. "0010233702"), alphanumeric (e.g. "IP-2026-ABC-0099"), or hyphenated. Do NOT reject because the format looks unusual. Set to null only if no such label is present.
  - au_id_date: "Identity verification date" / "ID verification" / "마이크로칩 확인일" / 180-day ID check date performed before export to Australia. YYYY-MM-DD.
  - au_sample_received_date: Date the RNATT (Rabies Neutralising Antibody Titre Test) blood sample was received/arrived at the testing laboratory. Labels include "Date received", "Sample received", "수령일", "도착일", "arrived at laboratory". NOT the collection/draw date — that's a separate field. YYYY-MM-DD.
- NOTE: The Export Quarantine Certificate rule above applies ONLY to flight fields. It does NOT suppress au_permit_no / au_id_date / au_sample_received_date — still extract those if present on the same document.
- New Zealand permit: nz_permit_no — extract from NZ MPI "Permit to Import" documents. Look for labels like "Permit Number", "Permit No", "Permit", or the alphanumeric code in the header/title (e.g. "D2605783C"). This is separate from au_permit_no.
- Return ONLY valid JSON, no markdown, no explanation.`

export async function extractFlightInfo(input: {
  images?: { base64: string; mediaType: string }[]
  text?: string
}): Promise<ExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY not configured' }
  }

  const client = new OpenAI({ apiKey })

  try {
    const userContent: OpenAI.ChatCompletionContentPart[] = []

    // Add all images
    if (input.images) {
      for (const img of input.images) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mediaType};base64,${img.base64}`,
          },
        })
      }
    }

    // Add text prompt
    const textPrompt = input.text
      ? `Extract flight and certificate information from this text:\n\n${input.text}`
      : 'Extract flight and certificate information from the image(s) above.'
    userContent.push({ type: 'text', text: textPrompt })

    if (!input.images?.length && !input.text) {
      return { ok: false, error: 'No input provided' }
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as FlightExtractResult

    const hasInbound = Object.values(parsed.inbound).some((v) => v !== null)
    const hasOutbound = Object.values(parsed.outbound).some((v) => v !== null)
    const hasAddr = !!parsed.address_overseas
    const hasCert = !!parsed.certificate_no
    const hasPass = !!(parsed.passport_issue_date || parsed.passport_expiry_date || parsed.passport_nationality || parsed.passport_number || parsed.postal_code || parsed.email)
    const hasTime = !!parsed.arrival_time
    const hasQuar = !!parsed.quarantine_location
    const hasAu = !!(parsed.au_permit_no || parsed.au_id_date || parsed.au_sample_received_date)
    const hasNz = !!parsed.nz_permit_no
    if (!hasInbound && !hasOutbound && !hasAddr && !hasCert && !hasPass && !hasTime && !hasQuar && !hasAu && !hasNz) {
      return { ok: false, error: 'No information found' }
    }

    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
