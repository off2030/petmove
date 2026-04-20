'use server'

import OpenAI from 'openai'

/** 광견병항체검사 결과서 추출 전용 고정밀 모델. env OPENAI_TITER_MODEL 로 오버라이드. */
const TITER_EXTRACTION_MODEL = process.env.OPENAI_TITER_MODEL?.trim() || 'gpt-4.1'

export interface TiterInfo {
  /** 검사일(채혈일) — Collection Date / 채혈일 / Date of Sampling */
  date: string | null
  /** 검사수치 — 예: "3.0", "≥0.5 IU/mL", "2.48" */
  value: string | null
  /** 샘플수령일 — Date Received / 샘플수령일 (호주용) */
  sample_received_date: string | null
}

type ExtractResult =
  | { ok: true; data: TiterInfo }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract rabies antibody titer test result information from images or text.

Return ONLY a JSON object:
{
  "date": "YYYY-MM-DD — blood collection date (채혈일/Collection Date/Date of Sampling/Date of Collection) or null",
  "value": "Numerical titer result as a string (e.g. '3.0', '0.62', '≥0.5 IU/mL', '2.48') or null",
  "sample_received_date": "YYYY-MM-DD — date the laboratory received the sample (샘플수령일/Date Received/Received/Reception Date) or null"
}

CRITICAL ANTI-HALLUCINATION RULES:
- Return ONLY values literally visible in the image/text.
- If a field is not clearly present, return null. Do NOT guess, infer, or fabricate.
- NEVER compute or derive dates. Only what is literally printed/written.
- Do NOT copy a date from one field into another.

FIELD GUIDELINES:
- "date" (채혈일) is the date the blood sample was drawn from the animal. Labels: 채혈일, Collection Date, Date of Sampling, Date of Collection, Date of Sample Draw, Sample Date.
- "value" is the rabies antibody titer numeric result. Typical forms: "0.6", "2.48", "≥0.5", "3.0 IU/mL". Include the unit (IU/mL) only if it appears next to the number, otherwise just the number as string. If multiple values (different methods), prefer the primary/FAVN value.
- "sample_received_date" is when the testing lab received the sample. Labels: 샘플수령일, Date Received, Received, Reception Date, Arrival Date, Sample Received. Distinct from collection date.
- Convert all date formats to YYYY-MM-DD (e.g. "05 JUL 26" → "2026-07-05").
- If the document is not a rabies antibody titer report, return all nulls.
- Return ONLY valid JSON, no markdown, no explanation.`

export async function extractTiterInfo(input: {
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
        ? `Extract rabies titer information from this text:\n\n${input.text}`
        : 'Extract rabies titer information from this image.',
    })

    if (!input.imageBase64 && !input.text) {
      return { ok: false, error: 'No input provided' }
    }

    const response = await client.chat.completions.create({
      model: TITER_EXTRACTION_MODEL,
      max_tokens: 400,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as TiterInfo

    const hasData = Object.values(parsed).some((v) => v !== null)
    if (!hasData) return { ok: false, error: '항체검사 정보를 찾을 수 없습니다' }

    return { ok: true, data: parsed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
