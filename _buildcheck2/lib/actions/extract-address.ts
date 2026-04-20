'use server'

import OpenAI from 'openai'
import { EXTRACTION_MODEL } from '@/lib/openai-config'

type ExtractResult =
  | { ok: true; data: string }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract an overseas address from images or text.
The user needs the destination address in Japan (or another country) in English.

Return ONLY a JSON object:
{
  "address": "Full address in English, or null if not found"
}

Rules:
- Return the address in English. If it's in Japanese/Korean, romanize it.
- Include postal code if visible.
- If no address is found, return {"address": null}.
- Return ONLY valid JSON, no markdown, no explanation.`

export async function extractAddress(input: {
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
        ? `Extract the overseas address from this text:\n\n${input.text}`
        : 'Extract the overseas address from this image.',
    })

    if (!input.imageBase64 && !input.text) {
      return { ok: false, error: 'No input provided' }
    }

    const response = await client.chat.completions.create({
      model: EXTRACTION_MODEL,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr) as { address: string | null }

    if (!parsed.address) return { ok: false, error: 'No address found' }
    return { ok: true, data: parsed.address }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
