/**
 * Shared PDF fill logic driven by data/pdf-field-mappings.json.
 * Reads case row, resolves each field value via the mapping's transform,
 * and fills the PDF form.
 */
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mappings from '@/data/pdf-field-mappings.json'
import { lookupRabies, lookupExternalParasite, lookupInternalParasite, lookupComprehensive, lookupParasiteById, getParasiteFamily } from '@/lib/vaccine-lookup'
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

/** YYYY-MM-DD → dd/mm/yyyy for Australian forms. */
function fmtDateDMY(s: unknown): string {
  if (typeof s !== 'string') return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Compute full years + remaining months between birth and today. */
function ageParts(birth: unknown): { years: number; months: number } | null {
  if (typeof birth !== 'string') return null
  const m = birth.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const by = Number(m[1]); const bm = Number(m[2]) - 1; const bd = Number(m[3])
  const now = new Date()
  let years = now.getFullYear() - by
  let months = now.getMonth() - bm
  if (now.getDate() < bd) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  if (years < 0) return null
  return { years, months }
}

/** Format raw digit string into 010-XXXX-XXXX (10–11 digit Korean mobile). */
function fmtPhoneDash(raw: unknown): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
  return s
}

/** Today's date as YYYY/MM/DD local. */
function todayYMDSlash(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}/${mm}/${dd}`
}

/** rabies_dates: string[] 또는 {date, ...}[] 둘 다 지원 → 최신순 날짜 배열 */
function sortedDesc(dates: unknown): string[] {
  if (!Array.isArray(dates)) return []
  const normalized = dates
    .map(d => (typeof d === 'string' ? d : (d as { date?: string })?.date))
    .filter((d): d is string => typeof d === 'string' && !!d)
  return normalized.slice().sort((a, b) => b.localeCompare(a))
}

/** Same as sortedDesc but ascending — oldest first. */
function sortedAsc(dates: unknown): string[] {
  return sortedDesc(dates).slice().reverse()
}

interface ParasiteRecord {
  date: string
  product_id?: string | null
}
/** Sort parasite records (objects with date + optional product_id) by date desc. */
function sortedDescRecords(arr: unknown): ParasiteRecord[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map(item => typeof item === 'string' ? { date: item } : (item as ParasiteRecord))
    .filter(r => r && typeof r.date === 'string' && r.date)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * "기타 예방접종 및 기생충 처치내역" 슬롯 채우기용 시퀀스.
 * 우선순위: 종합백신 → 외부구충 → 내부구충 → (추후) 내외부 합제.
 * 각 타입당 가장 최근 1건만 픽업하고, 없는 타입은 스킵해서 앞으로 당김.
 */
interface OtherVacEntry {
  type: 'Vaccination' | 'Parasiticide'
  name: string
  manufacturer: string
  serial: string
  date: string
}
function buildOtherVaccineSequence(data: Record<string, unknown>): OtherVacEntry[] {
  const species = String(data.species ?? '').toLowerCase()
  const hasSpecies = species === 'dog' || species === 'cat'
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const out: OtherVacEntry[] = []

  // 1. 종합백신 (Comprehensive — Vaccination)
  const gv = sortedDesc(data.general_vaccine_dates)[0]
  if (gv) {
    const p = hasSpecies ? lookupComprehensive(species as 'dog' | 'cat', gv) : null
    out.push({
      type: 'Vaccination',
      name: p?.vaccine || p?.product || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      date: fmtDate(gv),
    })
  }

  // 2/3. Parasiticides — pick latest of each side, dedupe combo across sides.
  const buildParasite = (rec: ParasiteRecord, side: 'external' | 'internal'): OtherVacEntry => {
    if (rec.product_id) {
      const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
      return {
        type: 'Parasiticide',
        name: p?.product || '',
        manufacturer: p?.manufacturer ?? '',
        serial: p?.batch ?? '',
        date: fmtDate(rec.date),
      }
    }
    const p = hasSpecies
      ? (side === 'external'
          ? lookupExternalParasite(species as 'dog' | 'cat', rec.date)
          : lookupInternalParasite(species as 'dog' | 'cat', rec.date))
      : null
    return {
      type: 'Parasiticide',
      name: p?.product || p?.vaccine || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      date: fmtDate(rec.date),
    }
  }

  const seenComboKeys = new Set<string>()
  const dedupKey = (rec: ParasiteRecord): string | null => {
    if (!rec.product_id) return null
    return getParasiteFamily(rec.product_id)?.kind === 'combo'
      ? `${rec.product_id}@${rec.date}`
      : null
  }

  const ext = sortedDescRecords(data.external_parasite_dates)[0]
  if (ext) {
    const k = dedupKey(ext)
    if (k) seenComboKeys.add(k)
    out.push(buildParasite(ext, 'external'))
  }

  const int = sortedDescRecords(data.internal_parasite_dates)[0]
  if (int) {
    const k = dedupKey(int)
    if (!(k && seenComboKeys.has(k))) {
      out.push(buildParasite(int, 'internal'))
    }
  }

  return out
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
  // Exact-match checkbox, e.g. `checkbox:eq:neutered_male`
  const eqMatch = transform?.match(/^checkbox:eq:(.+)$/)
  if (eqMatch) {
    return String(raw ?? '') === eqMatch[1]
  }
  // Membership checkbox, e.g. `checkbox:in:male|neutered_male` — checks if value is any of the listed options
  const inMatch = transform?.match(/^checkbox:in:(.+)$/)
  if (inMatch) {
    const s = String(raw ?? '')
    return inMatch[1].split('|').includes(s)
  }

  // Extract nth char of the raw string (for microchip digit-per-box fields)
  const charMatch = transform?.match(/^char\[(\d+)\]$/)
  if (charMatch) {
    const s = String(raw ?? '')
    return s[Number(charMatch[1])] ?? ''
  }

  // Extract nth digit of the raw string (spaces/dashes stripped first).
  const digitMatch = transform?.match(/^digit\[(\d+)\]$/)
  if (digitMatch) {
    const s = String(raw ?? '').replace(/\D/g, '')
    return s[Number(digitMatch[1])] ?? ''
  }

  // Australian date format: dd/mm/yyyy
  if (transform === 'date_dmy') {
    return fmtDateDMY(raw)
  }

  // Age in full years computed from birth date.
  if (transform === 'age_years') {
    const a = ageParts(raw)
    return a ? String(a.years) : ''
  }
  if (transform === 'age_months') {
    const a = ageParts(raw)
    return a ? String(a.months) : ''
  }

  // Numeric comparison for weight range checkboxes etc.
  // Examples: `cmp:num:lt:5`, `cmp:num:ge:10`, `cmp:num:between:5:10` (inclusive low, exclusive high).
  const cmpMatch = transform?.match(/^cmp:num:(lt|le|gt|ge|eq|between|gt_lt):(.+)$/)
  if (cmpMatch) {
    const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return false
    const op = cmpMatch[1]
    const args = cmpMatch[2].split(':').map(Number)
    if (op === 'lt') return n < args[0]
    if (op === 'le') return n <= args[0]
    if (op === 'gt') return n > args[0]
    if (op === 'ge') return n >= args[0]
    if (op === 'eq') return n === args[0]
    if (op === 'between') return n >= args[0] && n < args[1]
    if (op === 'gt_lt') return n > args[0] && n < args[1]
    return false
  }

  // Phone formatting: raw digits → 010-XXXX-XXXX.
  if (transform === 'phone_dash') {
    return fmtPhoneDash(raw)
  }

  // Today's date (no source needed). Returns YYYY/MM/DD.
  if (transform === 'today_ymd_slash') {
    return todayYMDSlash()
  }

  // Boolean-coerce: truthy → checkbox on.
  if (transform === 'checkbox:truthy') {
    return !!(raw != null && raw !== '')
  }
  if (transform === 'checkbox:falsy') {
    return !(raw != null && raw !== '')
  }

  // Boolean: does the nth entry of an array source exist?
  // Uses ascending order (oldest first) to match Form25 vaccine row layout.
  const hasMatch = transform?.match(/^has\[(\d+)\]$/)
  if (hasMatch) {
    return !!sortedAsc(raw)[Number(hasMatch[1])]
  }

  // Form25 "기타 예방접종" slot filler. `other_vacc_seq:<attr>[<n>]`.
  // Pulls the nth entry of the compressed vaccine sequence built from
  // comprehensive → external → internal (skipping missing types).
  const seqMatch = transform?.match(/^other_vacc_seq:(type|name|manufacturer|serial|date)\[(\d+)\]$/)
  if (seqMatch) {
    const attr = seqMatch[1] as keyof OtherVacEntry
    const idx = Number(seqMatch[2])
    const entry = buildOtherVaccineSequence(data)[idx]
    return entry ? entry[attr] : ''
  }

  // Vaccine attribute accessors for rabies / external / internal parasites.
  // Pattern: `vaccine:<kind>:<attr>[<n>]` where
  //   kind = rabies | ext_parasite | int_parasite
  //   attr = name | manufacturer | serial | date
  const vacMatch = transform?.match(/^vaccine:(rabies|ext_parasite|int_parasite):(name|manufacturer|serial|date)\[(\d+)\]$/)
  if (vacMatch) {
    const kind = vacMatch[1]
    const attr = vacMatch[2]
    const idx = Number(vacMatch[3])
    // Oldest-first ordering: row 1 = first dose, row 2 = second, etc.
    const date = sortedAsc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    const species = String(data.species ?? '').toLowerCase()
    let p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null } | null = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'ext_parasite' && (species === 'dog' || species === 'cat')) p = lookupExternalParasite(species, date)
    else if (kind === 'int_parasite' && (species === 'dog' || species === 'cat')) p = lookupInternalParasite(species, date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    return ''
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

  // NOTE: NeedAppearances intentionally NOT set to True. Setting it makes
  // Acrobat Reader ignore the appearance streams we built with NanumGothic
  // and re-render using its own Helvetica, which drops Korean glyphs.
  // updateFieldAppearances above generates valid appearance streams for all
  // text fields, so Acrobat has everything it needs to render as-is.

  const bytes = await pdf.save()
  const base64 = Buffer.from(bytes).toString('base64')
  const petName = (caseRow.pet_name_en || caseRow.pet_name || 'pet').replace(/[^\w가-힣]/g, '_')
  const filename = form.filename.replace('{pet_name}', petName)

  return { ok: true, pdf: base64, filename }
}
