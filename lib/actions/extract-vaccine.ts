'use server'

import OpenAI from 'openai'
import { DROP_CREATE_MODEL } from '@/lib/openai-config'

export interface VaccineInfo {
  date: string | null           // YYYY-MM-DD (접종일)
  valid_until: string | null    // YYYY-MM-DD 또는 'Nyr'(예: '3년') (면역유효기간)
  product: string | null        // 제품명
  manufacturer: string | null   // 제조사
  lot: string | null            // 로트/배치 번호
  expiry: string | null         // 제품 유효기간 (EXP 라벨)
}

type ExtractResult =
  | { ok: true; records: VaccineInfo[] }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract information about vaccines/parasiticides from images or text.

CRITICAL ANTI-HALLUCINATION RULES:
- You MUST ONLY return values that are literally visible in the image/text.
- If a field is not clearly present, return null for that field. Do NOT guess, infer, or fabricate.
- Do NOT copy a date from one field into another. Each date must be independently verified against its own label in the image.
- When in doubt, return null rather than making something up.

The image may contain MULTIPLE vaccination records (two or more stickers/entries). Return ALL records.

Return ONLY a JSON object with a "records" array:
{
  "records": [
    {
      "date": "YYYY-MM-DD — administration/injection date or null",
      "valid_until": "YYYY-MM-DD — immunity validity end date, or Nyr string like '1년'/'3년' if only a duration is given, or null",
      "product": "Vaccine/product name (e.g. Rabisin, NexGard Spectra, Vanguard Canine DAPP+L4) or null",
      "manufacturer": "Manufacturer (e.g. Boehringer Ingelheim, Merck, Zoetis) or null",
      "lot": "Lot/batch number (SER/Serial/Batch on the label) or null",
      "expiry": "YYYY-MM-DD — product shelf-life expiry ONLY, or null"
    }
  ]
}

If there's only ONE vaccination, still return a "records" array with one element.
If there are TWO OR MORE distinct vaccinations (different dates, different stickers, clearly separate entries), return one record per vaccination in order of appearance (earliest date first when dates differ).

Rules for disambiguating dates — READ CAREFULLY:

"date" (administration) triggers:
- Labels: "접종일", "주사일", "투여일", "Vaccination Date", "Date Given", "Date of Administration", "DOA"
- On vaccination record stickers/certificates, the date entered by the vet.
- If the image is a completed vaccination record/sticker (with owner/pet info, signature, stamp), ANY date on it is likely the administration date unless explicitly labeled otherwise.

"expiry" (product shelf life) triggers ONLY these:
- Explicit labels: "EXP", "Expiry", "Expiration", "유효기한", "사용기한", "Use By", "Best Before"
- Printed on the vial/box by the manufacturer (not handwritten, not filled in)
- If NO such explicit expiry label is present, "expiry" MUST be null.

"valid_until" (immunity validity):
- Labels: "면역유효기간", "Valid Until", "Next Due", "다음접종일", "Booster Due"
- Duration like "3 years" / "1 year" / "3년" → return "3년" / "1년" string.

When only ONE date is visible and it has no explicit expiry label → put it in "date", NOT "expiry".
Never duplicate the same date across multiple fields.

Other rules:
- Convert all date formats to YYYY-MM-DD (e.g. "05 JUL 26" → "2026-07-05").
- "product" = full product name on the label (Korean or English).
- If the input is not vaccine/parasiticide related, return all nulls.
- Return ONLY valid JSON, no markdown, no explanation.`

export async function extractVaccineInfo(input: {
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
        ? `Extract vaccination information from this text:\n\n${input.text}`
        : 'Extract vaccination information from this image.',
    })

    if (!input.imageBase64 && !input.text) {
      return { ok: false, error: 'No input provided' }
    }

    const response = await client.chat.completions.create({
      model: DROP_CREATE_MODEL,
      max_tokens: 800,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as { records?: VaccineInfo[] } | VaccineInfo

    // 하위호환: 모델이 레거시 flat 객체를 반환하면 records 배열로 감쌈.
    const records: VaccineInfo[] = Array.isArray((parsed as { records?: VaccineInfo[] }).records)
      ? (parsed as { records: VaccineInfo[] }).records
      : [parsed as VaccineInfo]

    const nonEmpty = records.filter(r => r && Object.values(r).some(v => v !== null))
    if (nonEmpty.length === 0) return { ok: false, error: 'No vaccination info found' }

    return { ok: true, records: nonEmpty }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
