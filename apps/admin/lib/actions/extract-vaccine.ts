'use server'

import OpenAI from 'openai'

/** 백신/구충제 이미지 추출 전용 고정밀 모델. env OPENAI_VACCINE_MODEL 로 오버라이드 가능. */
const VACCINE_EXTRACTION_MODEL = process.env.OPENAI_VACCINE_MODEL?.trim() || 'gpt-4.1'

export interface VaccineInfo {
  date: string | null           // YYYY-MM-DD (접종일)
  valid_until: string | null    // YYYY-MM-DD 또는 'Nyr'(예: '3년') (면역유효기간)
  product: string | null        // 제품명
  manufacturer: string | null   // 제조사
  lot: string | null            // 로트/배치 번호
  expiry: string | null         // 제품 유효기간 (EXP 라벨)
  category: VaccineCategory | null  // 제품명 기반 카테고리
}

export type VaccineCategory =
  | 'rabies'
  | 'comprehensive_dog'
  | 'comprehensive_cat'
  | 'civ'
  | 'kennel_cough'
  | 'parasite_internal_dog'
  | 'parasite_external_dog'
  | 'parasite_external_cat'
  | 'parasite_combo_dog'
  | 'parasite_combo_cat'
  | 'heartworm_dog'
  | 'heartworm_cat'

type ExtractResult =
  | { ok: true; records: VaccineInfo[] }
  | { ok: false; error: string }

const SYSTEM_PROMPT = `You extract information about vaccines/parasiticides from images or text.

CRITICAL ANTI-HALLUCINATION RULES (apply to ALL formats — table, sticker, booklet, label, scan, photo, etc.):
- You MUST ONLY return values that are literally visible/written/printed in the image or text.
- If a field is not clearly present, return null for that field. Do NOT guess, infer, or fabricate.
- Do NOT copy a date from one field into another. Each date must be independently verified against its own explicit label.
- NEVER compute or derive dates (e.g. date + 1 year, today + N days). Only report dates that are literally printed/written.
- Duration checkboxes like ☑1Y, ☑2년, 3 years must map to valid_until as the duration string ("1년"/"2년"/"3년"). Do NOT turn them into a computed YYYY-MM-DD and do NOT put them in expiry.
- When in doubt, return null rather than making something up.

Images may vary widely in format — vaccination booklets, individual vial labels, handwritten entries, printed certificates, clinic records, photos of boxes, etc. The rules above apply to all of them. Extract only what you can literally read; don't let format conventions tempt you to infer missing fields.

CONCRETE EXAMPLES (follow these patterns):

EXAMPLE 1 — Korean table row with validity checkbox:
Image row shows: "Cani shot (RV-K) | Choong Ang Vaccine | 325 RUK 01 | 2023.10.30 | ☑1Y ☐2Y ☐3Y"
No EXP/유효기한 label anywhere.

WRONG output (do NOT do this):
{
  "date": "2023-10-30",
  "valid_until": "2024-10-30",
  "expiry": "2025-01-06",
  "product": "Cani shot (RV-K)", "manufacturer": "Choong Ang Vaccine", "lot": "325 RUK 01"
}
Wrong because: valid_until was computed (forbidden), expiry was fabricated (not in image).

CORRECT output:
{
  "date": "2023-10-30",
  "valid_until": "1년",
  "expiry": null,
  "product": "Cani shot (RV-K)", "manufacturer": "Choong Ang Vaccine", "lot": "325 RUK 01"
}

EXAMPLE 2 — Vaccine vial label only (no administration context):
Image shows vial printed with: "Rabisin | Boehringer Ingelheim | Lot G98321 | EXP 2027-05"
No vaccination date, no validity checkbox.

CORRECT output:
{
  "date": null,
  "valid_until": null,
  "expiry": "2027-05-01",
  "product": "Rabisin", "manufacturer": "Boehringer Ingelheim", "lot": "G98321"
}
(expiry "2027-05" → "2027-05-01" conservative day=01 when only month is given)

EXAMPLE 3 — Sticker with both vaccination date and explicit EXP:
Image shows: "Injected: 2024-03-15 | EXP: 2026-12-31 | Product: X | Mfg: Y"

CORRECT output:
{
  "date": "2024-03-15",
  "valid_until": null,
  "expiry": "2026-12-31",
  ...
}

The image may contain MULTIPLE vaccination records (two or more stickers/entries). Return ALL records.

CATEGORY CLASSIFICATION — classify each record into ONE of these codes based on the product name/type:

- "rabies" — 광견병 백신. Examples: Rabisin, Nobivac Rabies, Defensor, Canigen R, Biocan R
- "comprehensive_dog" — 강아지 종합백신 (DHPPL/DHPP/DAPP/DAPPL). Examples: Vanguard Plus, Canigen DHPPi, Nobivac DHPPi, Canishot DHPPL, Duramune, Recombitek C
- "comprehensive_cat" — 고양이 종합백신 (FVRCP). Examples: Nobivac Feline, Felocell, Purevax Feline, Fevac
- "civ" — 개 인플루엔자 백신 (CIV). Examples: Nobivac Canine Flu, Vanguard CIV
- "kennel_cough" — 켄넬코프 (Bordetella + Parainfluenza). Examples: Nobivac KC, Bronchi-Shield, Canigen KC
- "parasite_internal_dog" — 내부 구충제 (강아지·고양이 구분 없음). Examples: Drontal Plus, Drontal Cat, Milbemax (internal only), Canex
- "parasite_external_dog" — 강아지 외부 구충제 (벼룩/진드기). Examples: Frontline Plus Dog, Advantix, Bravecto (topical/chewable flea-tick only), Seresto Dog collar
- "parasite_external_cat" — 고양이 외부 구충제. Examples: Frontline Plus Cat, Advantage Cat, Revolution Cat (if flea-only)
- "parasite_combo_dog" — 강아지 내외부 합제 (both internal + external on one label). Examples: NexGard Spectra, Simparica Trio, Credelio Plus, Advocate Dog
- "parasite_combo_cat" — 고양이 내외부 합제. Examples: Revolution Plus Cat, Advocate Cat, Broadline
- "heartworm_dog" — 강아지 심장사상충 전용 (NOT a combo). Examples: Heartgard (ivermectin only), Interceptor (milbemycin only), Iverhart
- "heartworm_cat" — 고양이 심장사상충 전용. Examples: Heartgard for Cats, Interceptor Cat

Rules:
- If the product is clearly a combo (e.g. NexGard Spectra covers fleas+ticks+heartworm+intestinal), pick "parasite_combo_*".
- If you see "Heartgard Plus" (heartworm + hookworm/roundworm) treat as combo dewormer → "parasite_combo_dog".
- Species hint: dog vs cat. If unclear from the product name, look for "canine"/"feline" or pictograms on the label.
- If you genuinely cannot tell which category it belongs to, set category to null.
- Do not invent categories not in this list.

Return ONLY a JSON object with a "records" array:
{
  "records": [
    {
      "date": "YYYY-MM-DD — administration/injection date or null",
      "valid_until": "YYYY-MM-DD — immunity validity end date, or Nyr string like '1년'/'3년' if only a duration is given, or null",
      "product": "Vaccine/product name (e.g. Rabisin, NexGard Spectra, Vanguard Canine DAPP+L4) or null",
      "manufacturer": "Manufacturer (e.g. Boehringer Ingelheim, Merck, Zoetis) or null",
      "lot": "Lot/batch number (SER/Serial/Batch on the label) or null",
      "expiry": "YYYY-MM-DD — product shelf-life expiry ONLY, or null",
      "category": "one of the category codes above, or null if unclear"
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
      model: VACCINE_EXTRACTION_MODEL,
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
