'use server'

/**
 * 하나 이상의 이미지(수첩·증명서·신분증 스캔·카톡 캡처 등 무엇이든)에서
 * 새 케이스의 고객정보 + 동물정보를 한 번의 OpenAI 호출로 추출한다.
 *
 * 범위: 상세페이지의 "고객정보" + "동물정보" 그룹 필드만.
 * 목적지·항공편·여권·해외주소는 필요 시 각 섹션의 별도 추출 플로우에서 처리.
 */

import OpenAI from 'openai'
import { DROP_CREATE_MODEL } from '@/lib/openai-config'
import { lookupKoreanZipcode } from '@/lib/kakao-address'

export interface ExtractAllResult {
  // --- 동물정보 ---
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

  // --- 고객정보 ---
  customer_name: string | null
  customer_name_en: string | null
  customer_first_name_en: string | null
  customer_last_name_en: string | null
  phone: string | null             // E.164 없이 사용자 입력 그대로
  address_kr: string | null        // 국내 주소 (한글)
  address_en: string | null        // 국내 주소 영문
  address_zipcode: string | null   // 국내 우편번호 (5~6자리)
  email: string | null
}

type Result =
  | { ok: true; data: ExtractAllResult }
  | { ok: false; error: string }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'pet_name', 'pet_name_en', 'species', 'breed', 'breed_en', 'color', 'color_en',
    'sex', 'birth_date', 'weight', 'microchip',
    'customer_name', 'customer_name_en', 'customer_first_name_en', 'customer_last_name_en',
    'phone', 'address_kr', 'address_en', 'address_zipcode', 'email',
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
    customer_name: { type: ['string', 'null'] },
    customer_name_en: { type: ['string', 'null'] },
    customer_first_name_en: { type: ['string', 'null'] },
    customer_last_name_en: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    address_kr: { type: ['string', 'null'] },
    address_en: { type: ['string', 'null'] },
    address_zipcode: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
  },
} as const

const SYSTEM_PROMPT = `You extract pet owner + pet identity information from one or more images (pet passports, vaccination records, microchip certs, ID scans, KakaoTalk screenshots, or any mixture).

Return ONE JSON object following the provided schema. For each field set the best value found in ANY of the images, or null if not found. Merge info across images: one image might give the owner, another gives the pet — both go into the same result.

=== 동물정보 (PET) ===
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

=== 고객정보 (OWNER) ===
- customer_name: Korean/original-script full name, verbatim as written
- customer_name_en: full English name, verbatim as written — preserve EVERY part (given + middle + family). Do not drop middle names or romanize differently. If the document shows "Hoa Mai Nguyen", return exactly "Hoa Mai Nguyen", not "Hoa Nguyen".
- customer_first_name_en: English given name(s) only — everything before the family name. For "Hoa Mai Nguyen" with family name "Nguyen", this is "Hoa Mai".
- customer_last_name_en: English family name only
- phone: phone number as written (010-XXXX-XXXX or +82...)
- address_kr: Korean domestic address. If a postal code is visible, put it in address_zipcode and keep the address itself zipcode-free.
- address_en: English-translated/romanized version of the address. Romanize road names (벚꽃로 → Beotkkot-ro), district (구 → -gu), city (시 → -si), province (도 → -do). Example: "서울시 금천구 벚꽃로 40, 102동 504호" → "40 Beotkkot-ro, Geumcheon-gu, Seoul, 102-504".
- address_zipcode: Korean postal code, 5 or 6 digits only (no parentheses, no "우편번호" prefix). Look for "(06234)", "우편번호 06234", "[06234]", or a standalone 5-6 digit number next to the address. null if not visible.
- email: email address

=== KOREAN ↔ ENGLISH FIELD PAIRING ===
Many fields come in pairs — e.g. (customer_name, customer_name_en), (pet_name, pet_name_en), (breed, breed_en), (color, color_en), (address_kr, address_en).

For every pair, the rule is INDEPENDENT extraction + bidirectional fill:
- If only Korean/original-script value is in the document → fill the Korean side AND derive the English/romanized side too.
- If only English/Latin/romanized value is in the document → fill the English side. Leave the Korean side null (do NOT invent Korean).
- If both are in the document → fill both verbatim.

Never skip an English-side value just because the Korean counterpart is missing. A Latin-only document (e.g. customs / import notification / overseas form) should still produce a fully populated *_en cluster (customer_name_en, address_en, pet_name_en, breed_en, color_en) even when every Korean field is null.

=== RULES ===
- Dates: always YYYY-MM-DD.
- Do NOT invent data. Anything not clearly present → null.
- When multiple person/address blocks appear (applicant vs shipper/consignor vs consignee/destination), the OWNER is the applicant/notifier — the person submitting the document, not the shipping intermediary.
- If multiple images contradict each other, prefer the value from the more authoritative document (microchip cert > vet book > KakaoTalk).
- Return ONLY valid JSON matching the schema.`

export async function extractAll(input: {
  images: { base64: string; mediaType: string }[]
  /**
   * 선택적 — PDF 의 selectable text 레이어 (파일별 1개 문자열).
   * vision OCR 보다 100% 정확하므로 모델이 우선 참고하도록 prompt 에 텍스트 블록으로 함께 주입.
   * 스캔 PDF 처럼 텍스트 레이어가 없는 입력은 빈 배열이면 됨.
   */
  pdfTexts?: string[]
}): Promise<Result> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not configured' }
  if (!input.images?.length && !input.pdfTexts?.length) {
    return { ok: false, error: 'No images or text provided' }
  }

  const client = new OpenAI({ apiKey })

  try {
    const userContent: OpenAI.ChatCompletionContentPart[] = []
    for (const img of input.images) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      })
    }
    if (input.pdfTexts && input.pdfTexts.length > 0) {
      userContent.push({
        type: 'text',
        text:
          'The following text was extracted directly from the PDF text layer (100% accurate, no OCR errors). ' +
          'Prefer values from this text over anything you might read from the rendered images:\n\n' +
          input.pdfTexts.map((t, i) => `=== PDF #${i + 1} ===\n${t}`).join('\n\n'),
      })
    }
    userContent.push({
      type: 'text',
      text: 'Extract everything you can and merge into the JSON schema.',
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
