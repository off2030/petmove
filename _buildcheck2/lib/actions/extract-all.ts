'use server'

/**
 * 하나 이상의 이미지(수첩·증명서·항공권·신분증 스캔·카톡 캡처 등 무엇이든)에서
 * 새 케이스를 만들 수 있는 모든 정보를 한 번의 OpenAI 호출로 추출한다.
 *
 * 파일별로 정보 종류가 제각각이라 (수첩=펫정보만, 항공권=항공편/주소만 등)
 * 각 필드는 없는 건 null로 둔다. 한 API 호출로 모든 필드를 시도해 비용·지연을 최소화.
 */

import OpenAI from 'openai'
import { DROP_CREATE_MODEL } from '@/lib/openai-config'
import { lookupKoreanZipcode } from '@/lib/kakao-address'

export interface ExtractedFlight {
  date: string | null
  departure_airport: string | null
  arrival_airport: string | null
  transport: string | null
  flight_number: string | null
}

export interface ExtractAllResult {
  // --- 펫 식별 ---
  pet_name: string | null
  pet_name_en: string | null
  species: string | null           // "dog" | "cat" | null
  breed: string | null
  breed_en: string | null
  color: string | null
  color_en: string | null
  sex: string | null               // "male"|"female"|"neutered_male"|"spayed_female"|null
  birth_date: string | null        // YYYY-MM-DD
  weight: string | null            // kg 숫자만
  microchip: string | null
  microchip_implant_date: string | null

  // --- 고객 ---
  customer_name: string | null
  customer_name_en: string | null
  customer_first_name_en: string | null
  customer_last_name_en: string | null
  phone: string | null             // E.164 없이 사용자 입력 그대로
  address_kr: string | null        // 국내 주소 (한글)
  address_en: string | null        // 국내 주소 영문
  address_zipcode: string | null   // 국내 우편번호 (5~6자리)
  email: string | null

  // --- 목적지 / 항공편 ---
  destination: string | null       // 한글 국가명 (예: "일본", "호주"). destination-config 키워드와 매칭됨
  inbound: ExtractedFlight
  outbound: ExtractedFlight
  address_overseas: string | null  // 해외 주소 영문

  // --- 여권 ---
  passport_number: string | null
  passport_issue_date: string | null
  passport_expiry_date: string | null
  passport_nationality: string | null
}

type Result =
  | { ok: true; data: ExtractAllResult }
  | { ok: false; error: string }

const FLIGHT_SCHEMA = {
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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'pet_name', 'pet_name_en', 'species', 'breed', 'breed_en', 'color', 'color_en',
    'sex', 'birth_date', 'weight', 'microchip', 'microchip_implant_date',
    'customer_name', 'customer_name_en', 'customer_first_name_en', 'customer_last_name_en',
    'phone', 'address_kr', 'address_en', 'address_zipcode', 'email',
    'destination', 'inbound', 'outbound', 'address_overseas',
    'passport_number', 'passport_issue_date', 'passport_expiry_date', 'passport_nationality',
  ],
  properties: {
    pet_name: { type: ['string', 'null'] },
    pet_name_en: { type: ['string', 'null'] },
    species: { type: ['string', 'null'], enum: ['dog', 'cat', null] },
    breed: { type: ['string', 'null'] },
    breed_en: { type: ['string', 'null'] },
    color: { type: ['string', 'null'] },
    color_en: { type: ['string', 'null'] },
    sex: {
      type: ['string', 'null'],
      enum: ['male', 'female', 'neutered_male', 'spayed_female', null],
    },
    birth_date: { type: ['string', 'null'] },
    weight: { type: ['string', 'null'] },
    microchip: { type: ['string', 'null'] },
    microchip_implant_date: { type: ['string', 'null'] },
    customer_name: { type: ['string', 'null'] },
    customer_name_en: { type: ['string', 'null'] },
    customer_first_name_en: { type: ['string', 'null'] },
    customer_last_name_en: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    address_kr: { type: ['string', 'null'] },
    address_en: { type: ['string', 'null'] },
    address_zipcode: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    destination: { type: ['string', 'null'] },
    inbound: FLIGHT_SCHEMA,
    outbound: FLIGHT_SCHEMA,
    address_overseas: { type: ['string', 'null'] },
    passport_number: { type: ['string', 'null'] },
    passport_issue_date: { type: ['string', 'null'] },
    passport_expiry_date: { type: ['string', 'null'] },
    passport_nationality: { type: ['string', 'null'] },
  },
} as const

const SYSTEM_PROMPT = `You extract pet travel case information from one or more images (pet passports, vaccination records, microchip certs, flight tickets, ID/passport scans, KakaoTalk screenshots, or any mixture).

Return ONE JSON object following the provided schema. For each field set the best value found in ANY of the images, or null if not found. Merge info across images: a vet book might give pet identity, a flight ticket gives routing — both go into the same result.

=== PET IDENTITY ===
- pet_name: Korean/Japanese/original script name
- pet_name_en: English/romanized name (e.g. "루이" → "Lui" / "Louie")
- species: "dog" or "cat" — infer from any clue (breed, "개"/"고양이", "犬"/"猫", "Canis"/"Felis"). null if unclear.
- breed: Korean name if available (e.g. "말티즈", "페르시안"); otherwise put the English name here too
- breed_en: English breed name (e.g. "Maltese", "Persian"). Convert Korean → English using standard FCI names.
- color: Korean color (e.g. "흰색", "검정/갈색")
- color_en: English color (e.g. "White", "Black and Tan")
- sex: normalized to one of "male"/"female"/"neutered_male"/"spayed_female". Map "수컷"/"male"/"M"→male, "암컷"/"female"/"F"→female, "중성화된 수컷"/"castrated"/"neutered"→neutered_male, "중성화된 암컷"/"spayed"→spayed_female. If the document just says male/female with no neuter info, use male/female.
- birth_date: YYYY-MM-DD
- weight: kg number only as a string (e.g. "3.5"). Drop the "kg" unit. If given in grams, convert.
- microchip: 15 digits, no spaces. If multiple chips listed, take the primary/current one.
- microchip_implant_date: YYYY-MM-DD when the chip was implanted (거치일/implantation date)

=== CUSTOMER ===
- customer_name: Korean/original-script full name, verbatim as written
- customer_name_en: full English name, verbatim as written — preserve EVERY part (given + middle + family). Do not drop middle names or romanize differently. If the document shows "Hoa Mai Nguyen", return exactly "Hoa Mai Nguyen", not "Hoa Nguyen".
- customer_first_name_en: English given name(s) only — everything before the family name. For "Hoa Mai Nguyen" with family name "Nguyen", this is "Hoa Mai".
- customer_last_name_en: English family name only
- phone: phone number as written (010-XXXX-XXXX or +82...)
- address_kr: Korean domestic address. If a postal code is visible, put it in address_zipcode and keep the address itself zipcode-free.
- address_en: English-translated/romanized version of the Korean address (NOT the overseas destination address). REQUIRED whenever address_kr is present — never return address_en as null if address_kr has a value. Romanize road names (벚꽃로 → Beotkkot-ro), district (구 → -gu), city (시 → -si), province (도 → -do). Example: "서울시 금천구 벚꽃로 40, 102동 504호" → "40 Beotkkot-ro, Geumcheon-gu, Seoul, 102-504".
- address_zipcode: Korean postal code, 5 or 6 digits only (no parentheses, no "우편번호" prefix). Look for "(06234)", "우편번호 06234", "[06234]", or a standalone 5-6 digit number next to the address. null if not visible.
- email: email address

=== DESTINATION & FLIGHTS ===
- destination: Korean country name for the TRIP destination. Infer from flight arrival airport, import permit issuer country, or explicit mention. Use one of these canonical names when possible: 일본, 미국, 캐나다, 호주, 뉴질랜드, 영국, 프랑스, 독일, 이탈리아, 스페인, 네덜란드, 태국, 싱가포르, 필리핀, 인도네시아, 베트남, 말레이시아, 홍콩, 대만, 중국, 유럽연합. If none match, use a free-form Korean country name. null if unknown.
- inbound flight: Korea → destination. departure_airport is Korean (ICN/GMP/PUS/CJU), arrival_airport is the destination country.
- outbound flight: destination → Korea. Reverse of inbound.
- transport enum: Carry-on / Checked-baggage / Cargo / Cargo(Sea). Korean: 기내탑승→Carry-on, 수하물/수화물→Checked-baggage, 화물→Cargo, 선박/해상→Cargo(Sea). When transport isn't stated, default to "Carry-on". Q&A format ("기내 혹은 수화물칸 탑승 여부: 기내탑승") → use the ANSWER after the colon.
- address_overseas: destination address in English (romanize Japanese/Thai as needed)

=== PASSPORT ===
- Only for human passport scans: extract issue/expiry dates (YYYY-MM-DD), nationality (English country name), passport number.

=== RULES ===
- Dates: always YYYY-MM-DD.
- Airports: IATA 3-letter codes.
- Do NOT invent data. Anything not clearly present → null.
- If multiple images contradict each other, prefer the value from the more authoritative document (microchip cert > passport > vet book > KakaoTalk).
- Return ONLY valid JSON matching the schema.`

export async function extractAll(input: {
  images: { base64: string; mediaType: string }[]
}): Promise<Result> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not configured' }
  if (!input.images?.length) return { ok: false, error: 'No images provided' }

  const client = new OpenAI({ apiKey })

  try {
    const userContent: OpenAI.ChatCompletionContentPart[] = []
    for (const img of input.images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      })
    }
    userContent.push({
      type: 'text',
      text: 'Extract everything you can from these images and merge into the JSON schema.',
    })

    const response = await client.chat.completions.create({
      model: DROP_CREATE_MODEL,
      max_tokens: 1500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'extract_all',
          strict: true,
          schema: SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(text) as ExtractAllResult

    // 이미지에 우편번호가 없으면 Kakao Local API로 한글 주소 → 우편번호 조회.
    // Daum 위젯(클라이언트 팝업)과 달리 서버에서 자동 해결해야 사용자 개입 없이 채워짐.
    if (!parsed.address_zipcode && parsed.address_kr) {
      const lookup = await lookupKoreanZipcode(parsed.address_kr)
      if (lookup?.zipcode) parsed.address_zipcode = lookup.zipcode
    }

    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
