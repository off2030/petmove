/**
 * Shared PDF fill logic driven by data/pdf-field-mappings.json.
 * Reads case row, resolves each field value via the mapping's transform,
 * and fills the PDF form.
 */
import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mappings from '@/data/pdf-field-mappings.json'
import { lookupRabies } from '@/lib/vaccine-lookup'
import type { CaseRow } from '@/lib/supabase/types'

type FieldMapping = {
  source: string | null
  transform?: string
  default?: string
  note?: string
}

type FormMapping = {
  template: string
  description: string
  filename: string
  fields: Record<string, FieldMapping>
}

type MappingsJson = Record<string, FormMapping>
const MAPS = mappings as MappingsJson

const LAB_INFO: Record<string, { name: string; country: string }> = {
  krsl:        { name: 'Komipharm Rabies Serology Laboratory', country: 'Republic of Korea' },
  apqa_seoul:  { name: 'Animal and Plant Quarantine Agency (APQA) Seoul Office', country: 'Republic of Korea' },
  apqa_hq:     { name: 'Animal and Plant Quarantine Agency (APQA)', country: 'Republic of Korea' },
  ksvdl_r:     { name: 'Kansas State Rabies Laboratory', country: 'United States of America' },
  ksvdl:       { name: 'Kansas Veterinary Diagnostic Laboratory', country: 'United States of America' },
  vbddl:       { name: 'Vector Borne Disease Diagnostic Laboratory', country: 'United States of America' },
}

const SPECIES_EN: Record<string, string> = { dog: 'Dog', cat: 'Cat' }

/** YYYY-MM-DD → YYYY/MM/DD for Japan forms. */
function fmtDate(s: unknown): string {
  if (typeof s !== 'string' || !s) return ''
  return s.replace(/-/g, '/')
}

/** rabies_dates: string[] 또는 {date, ...}[] 둘 다 지원 → 최신순 날짜 배열 */
function sortedDesc(dates: unknown): string[] {
  if (!Array.isArray(dates)) return []
  const normalized = dates
    .map(d => (typeof d === 'string' ? d : (d as { date?: string })?.date))
    .filter((d): d is string => typeof d === 'string' && !!d)
  return normalized.slice().sort((a, b) => b.localeCompare(a))
}

interface TiterRec { date: string | null; value: string | null; lab: string | null }

function sortedTiters(records: unknown): TiterRec[] {
  if (!Array.isArray(records)) return []
  return (records as TiterRec[])
    .filter(r => r && r.date)
    .slice()
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** Earliest titer date = 1차 광견병항체검사 */
function firstTiterDate(data: Record<string, unknown>): string | null {
  const recs = sortedTiters(data.rabies_titer_records)
  if (recs.length === 0) return null
  return recs[recs.length - 1].date ?? null
}

/** rabies_dates 중 1차 항체검사일 이후(>)만, 최신순 */
function rabiesDatesAfterFirstTiter(raw: unknown, data: Record<string, unknown>): string[] {
  const after = firstTiterDate(data)
  const all = sortedDesc(raw)
  if (!after) return []
  return all.filter(d => d > after)
}

type Resolved = string | boolean

/** _en 필드가 비어있으면 한글 필드로 폴백 */
const EN_FALLBACK: Record<string, string> = {
  customer_name_en: 'customer_name',
  pet_name_en: 'pet_name',
  breed_en: 'breed',
  color_en: 'color',
  sex_en: 'sex',
  address_en: 'address_kr',
  address_overseas: 'address_kr',
}

function readSource(
  source: string,
  caseRow: CaseRow,
  data: Record<string, unknown>,
): unknown {
  // Composite English customer name: "First Last" from split data fields,
  // falling back to the legacy customer_name_en column.
  if (source === 'customer_name_en') {
    const first = ((data.customer_first_name_en as string) ?? '').trim()
    const last = ((data.customer_last_name_en as string) ?? '').trim()
    if (first || last) return [first, last].filter(Boolean).join(' ')
    const legacy = (caseRow as unknown as Record<string, unknown>).customer_name_en
    if (legacy != null && legacy !== '') return legacy
    // Final fallback to Korean name
    return (caseRow as unknown as Record<string, unknown>).customer_name ?? ''
  }

  const fromRow = (caseRow as unknown as Record<string, unknown>)[source]
  const v = fromRow != null ? fromRow : data[source]
  if (v != null && v !== '') return v
  const fallback = EN_FALLBACK[source]
  if (fallback) {
    const fromRow2 = (caseRow as unknown as Record<string, unknown>)[fallback]
    return fromRow2 != null ? fromRow2 : data[fallback]
  }
  return v
}

function resolveField(
  mapping: FieldMapping,
  caseRow: CaseRow,
  data: Record<string, unknown>,
): Resolved {
  const { source, transform } = mapping
  const raw = source ? readSource(source, caseRow, data) : null

  // Checkboxes
  if (transform === 'checkbox:always_true') return true
  if (transform === 'checkbox:male') {
    const s = String(raw ?? '')
    return s === 'male' || s === 'neutered_male'
  }
  if (transform === 'checkbox:female') {
    const s = String(raw ?? '')
    return s === 'female' || s === 'spayed_female'
  }

  // Text transforms
  if (transform === 'en' && source === 'species') {
    return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  }

  if (transform === 'date_or_age') {
    if (typeof raw === 'string' && raw) return fmtDate(raw)
    const age = data.age
    return age ? String(age) : ''
  }

  const arrMatch = transform?.match(/^array\[(\d+)\](?:\.(\w+))?$/)
  if (arrMatch) {
    const idx = Number(arrMatch[1])
    const prop = arrMatch[2]
    if (source === 'rabies_dates') {
      const dates = sortedDesc(raw)
      return fmtDate(dates[idx])
    }
    if (source === 'rabies_titer_records') {
      const rec = sortedTiters(raw)[idx]
      if (!rec) return ''
      if (prop === 'date') return fmtDate(rec.date)
      if (prop === 'value') return rec.value ?? ''
      if (prop === 'lab') return rec.lab ? (LAB_INFO[rec.lab]?.name ?? rec.lab) : ''
      if (prop === 'lab_country') return rec.lab ? (LAB_INFO[rec.lab]?.country ?? '') : ''
    }
    return ''
  }

  // Rabies records done AFTER the 1st titer test (FormRE)
  const afterTiterMatch = transform?.match(/^after_titer\[(\d+)\]$/)
  if (afterTiterMatch && source === 'rabies_dates') {
    const idx = Number(afterTiterMatch[1])
    return fmtDate(rabiesDatesAfterFirstTiter(raw, data)[idx])
  }
  const afterTiterProductMatch = transform?.match(/^after_titer_product\[(\d+)\]$/)
  if (afterTiterProductMatch && source === 'rabies_dates') {
    const idx = Number(afterTiterProductMatch[1])
    const date = rabiesDatesAfterFirstTiter(raw, data)[idx]
    const p = date ? lookupRabies(date) : null
    if (!p) return ''
    const name = p.vaccine || p.product
    return name ? `${name} (${p.manufacturer})` : p.manufacturer
  }
  const afterTiterPeriodMatch = transform?.match(/^after_titer_period\[(\d+)\]$/)
  if (afterTiterPeriodMatch && source === 'rabies_dates') {
    const idx = Number(afterTiterPeriodMatch[1])
    const date = rabiesDatesAfterFirstTiter(raw, data)[idx]
    return date && lookupRabies(date) ? '1' : ''
  }

  // Titer fields rendered only when a 2nd titer exists (FormRE)
  const ifMultiMatch = transform?.match(/^if_multi\[(\d+)\]\.(\w+)$/)
  if (ifMultiMatch && source === 'rabies_titer_records') {
    const idx = Number(ifMultiMatch[1])
    const prop = ifMultiMatch[2]
    const recs = sortedTiters(raw)
    if (recs.length < 2) return ''
    const rec = recs[idx]
    if (!rec) return ''
    if (prop === 'date') return fmtDate(rec.date)
    if (prop === 'value') return rec.value ?? ''
    if (prop === 'lab') return rec.lab ? (LAB_INFO[rec.lab]?.name ?? rec.lab) : ''
    if (prop === 'lab_country') return rec.lab ? (LAB_INFO[rec.lab]?.country ?? '') : ''
    return ''
  }

  const productMatch = transform?.match(/^product\[(\d+)\]$/)
  if (productMatch && source === 'rabies_dates') {
    const idx = Number(productMatch[1])
    const date = sortedDesc(raw)[idx]
    const p = date ? lookupRabies(date) : null
    if (!p) return ''
    const name = p.vaccine || p.product
    return name ? `${name} (${p.manufacturer})` : p.manufacturer
  }

  const periodMatch = transform?.match(/^period\[(\d+)\]$/)
  if (periodMatch && source === 'rabies_dates') {
    const idx = Number(periodMatch[1])
    const date = sortedDesc(raw)[idx]
    const p = date ? lookupRabies(date) : null
    return p ? '1' : ''
  }

  // No transform — direct value from column or data
  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string') {
    // Format date-looking fields (YYYY-MM-DD) for Japan forms
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDate(raw)
    return raw
  }
  return String(raw)
}

export type FillResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

export async function fillPdf(formKey: string, caseRow: CaseRow): Promise<FillResult> {
  const form = MAPS[formKey]
  if (!form) return { ok: false, error: `Unknown form: ${formKey}` }

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', form.template)
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: `템플릿을 찾을 수 없습니다: ${form.template}` }
  }

  const pdf = await PDFDocument.load(templateBytes)
  pdf.registerFontkit(fontkit)
  const fontBytes = await readFile(path.join(process.cwd(), 'data', 'fonts', 'NanumGothic.ttf'))
  const customFont = await pdf.embedFont(fontBytes, { subset: false })

  const pdfForm = pdf.getForm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  const missing: string[] = []
  const empty: string[] = []
  const filled: Record<string, string | boolean> = {}
  for (const [fieldName, mapping] of Object.entries(form.fields)) {
    const value = resolveField(mapping, caseRow, data)
    if (value === '' || value === false) empty.push(fieldName)
    else filled[fieldName] = typeof value === 'string' && value.length > 40 ? value.slice(0, 40) + '…' : value
    let field
    try {
      field = pdfForm.getField(fieldName)
    } catch {
      missing.push(fieldName)
      continue
    }
    const type = field.constructor.name
    if (type === 'PDFCheckBox') {
      if (value === true) (field as import('pdf-lib').PDFCheckBox).check()
      else (field as import('pdf-lib').PDFCheckBox).uncheck()
    } else if (type === 'PDFTextField') {
      const text = typeof value === 'string' ? value : ''
      if (text) {
        const tf = field as import('pdf-lib').PDFTextField
        tf.setText(text)
      }
    }
  }

  // Rebuild ALL text-field appearances with NanumGothic at the form level.
  // Needed because some templates (esp. ones re-saved by Acrobat Pro with
  // fonts embedded) carry field DAs that reference unavailable fonts and
  // per-field updateAppearances() may not fully override them.
  pdfForm.updateFieldAppearances(customFont)

  console.log(`\n[${formKey}] case=${caseRow.id}`)
  console.log(`  case.data keys:`, Object.keys(data))
  console.log(`  filled:`, filled)
  console.log(`  empty (no value resolved):`, empty)
  if (missing.length) console.warn(`  missing PDF fields:`, missing)

  // Acrobat Reader: 앱리어런스 스트림 없는 필드도 렌더링하도록
  const acroForm = pdfForm.acroForm.dict
  acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True)

  const bytes = await pdf.save()
  const base64 = Buffer.from(bytes).toString('base64')
  const petName = (caseRow.pet_name_en || caseRow.pet_name || 'pet').replace(/[^\w가-힣]/g, '_')
  const filename = form.filename.replace('{pet_name}', petName)

  return { ok: true, pdf: base64, filename }
}
