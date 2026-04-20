'use server'

import OpenAI from 'openai'
import { EXTRACTION_MODEL } from '@/lib/openai-config'

export interface VaccineInfo {
  date: string | null           // YYYY-MM-DD (접종일)
  valid_until: string | null    // YYYY-MM-DD (유효기간)
  product: string | null        // 제품명
  manufacturer: string | null   // 제조사
  lot: string | null            // 로트/배치 번호
  expiry: string | null         // 제품 유효기간
}

type ExtractResult =
  | { ok: true; data: VaccineInfo }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract information about a vaccine/parasiticide from images or text.

Return ONLY a JSON object:
{
  "date": "YYYY-MM-DD — date of administration (접종일/Vaccination Date/Date Given/투여일) or null",
  "valid_until": "YYYY-MM-DD — immunity validity end date (면역유효기간/Valid Until/Next Due/다음접종일) or Nyr string like '1년'/'3년' if only a duration is given, or null",
  "product": "Vaccine/product name (e.g. Rabisin, NexGard Spectra, Vanguard Canine DAPP+L4) or null",
  "manufacturer": "Manufacturer (e.g. Boehringer Ingelheim, Merck, Zoetis) or null",
  "lot": "Lot/batch number (SER/Serial/Batch number on the label) or null",
  "expiry": "YYYY-MM-DD — product shelf-life expiry date (EXP/유효기한 on the label) or null"
}

Rules:
- "date" = administration/injection date on the certificate or sticker. Convert any format to YYYY-MM-DD.
- "valid_until" = next-due or validity-end date if shown. If only a duration like "3 years" or "1 year" is shown, return "3년" / "1년". Otherwise null.
- "expiry" = product shelf life only (EXP/유효기한 label). Distinct from valid_until. Convert "05 JUL 26" → "2026-07-05".
- "product" should be the full product name as shown on the label (Korean or English).
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
      model: EXTRACTION_MODEL,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as VaccineInfo

    const hasData = Object.values(parsed).some((v) => v !== null)
    if (!hasData) return { ok: false, error: 'No vaccination info found' }

    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
