'use server'

import OpenAI from 'openai'
import { EXTRACTION_MODEL } from '@/lib/openai-config'

export interface HawaiiInfo {
  passport_number: string | null          // 여권번호 마지막 4자리
  passport_issuing_country: string | null // 발행국 (Republic of Korea 등)
  passport_expiry_date: string | null     // YYYY-MM-DD
  date_of_birth: string | null            // YYYY-MM-DD
  address_overseas: string | null         // 해외주소 (영문)
  postal_code: string | null              // 우편번호
  email_address: string | null            // 이메일
}

type ExtractResult =
  | { ok: true; data: HawaiiInfo }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract Hawaii entry form information from images or text (passport, address, email, etc.).

Return ONLY a JSON object:
{
  "passport_number": "LAST 4 DIGITS of passport number only (e.g. 'M12345678' → '5678') or null",
  "passport_issuing_country": "Issuing country in English (e.g. 'Republic of Korea') or null",
  "passport_expiry_date": "YYYY-MM-DD — passport EXPIRY date labeled '기간만료일' or 'Date of expiry' (NOT 발급일/Date of issue). On Korean passports this appears near the BOTTOM RIGHT. Must be later than Date of issue (typically 10 years later). or null",
  "date_of_birth": "YYYY-MM-DD — holder's DATE OF BIRTH labeled '생년월일' or 'Date of birth' or null",
  "address_overseas": "Overseas address in English (street + city + state if present, no postal code) or null",
  "postal_code": "Postal/ZIP code or null",
  "email_address": "Email address or null"
}

Rules:
- "passport_number": Only the LAST 4 digits/characters. Never the full number.
- Dates: Convert any format (e.g. '05 JUL 2026', '2026/07/05', '05.07.2026') to YYYY-MM-DD.
- "passport_issuing_country": Always English full name, e.g. 'KOR' → 'Republic of Korea'.
- "address_overseas": Street + city (+ state) in English, excluding postal code (postal_code field handles that separately).
- If a field is not present in the input, set it to null.
- Return ONLY valid JSON, no markdown, no explanation.`

export async function extractHawaiiInfo(input: {
  imageBase64?: string
  mediaType?: string
  text?: string
}): Promise<ExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not configured' }

  const client = new OpenAI({ apiKey })

  try {
    const userContent: OpenAI.ChatCompletionContentPart[] = []

    if (input.imageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${input.mediaType || 'image/jpeg'};base64,${input.imageBase64}` },
      })
    }

    userContent.push({
      type: 'text',
      text: input.text
        ? `Extract Hawaii entry form information from this text:\n\n${input.text}`
        : 'Extract Hawaii entry form information from this image.',
    })

    if (!input.imageBase64 && !input.text) {
      return { ok: false, error: 'No input provided' }
    }

    const response = await client.chat.completions.create({
      model: EXTRACTION_MODEL,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as HawaiiInfo

    const hasData = Object.values(parsed).some((v) => v !== null)
    if (!hasData) return { ok: false, error: 'No Hawaii info found' }

    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
