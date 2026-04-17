/**
 * Shared PDF fill logic driven by data/pdf-field-mappings.json.
 * Reads case row, resolves each field value via the mapping's transform,
 * and fills the PDF form.
 */
import { PDFDocument, PDFName, PDFString, PDFDict, PDFBool, TextAlignment } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mappings from '@/data/pdf-field-mappings.json'
import { lookupRabies, lookupExternalParasite, lookupInternalParasite, lookupComprehensive, lookupCiv, lookupKennelCough, lookupParasiteById, getParasiteFamily } from '@/lib/vaccine-lookup'
import type { CaseRow } from '@/lib/supabase/types'

/* ─── Performance feature flags ────────────────────────────────────────
 * Flip any to `false` to revert to the original slower-but-safe behavior.
 * - SUBSET_FONT: embed only used glyphs (~4MB → ~100KB).
 * - CACHE_ASSETS: cache template + font bytes in memory (first hit hits disk,
 *   later hits reuse). Template/font file changes require server restart.
 * - REMOVE_NEED_APPEARANCES: drop AcroForm's /NeedAppearances so Acrobat
 *   doesn't regenerate APs on every open. We already bake APs via
 *   updateFieldAppearances, so this is the correct final state.
 */
// Optimized for browser-only viewing/editing (Chrome PDFium, Edge, Firefox).
// Browsers render typed text via their own font stack, so the embedded font
// only needs the glyphs we pre-filled. Subset = big speed+size win (~4MB→~100KB).
//
// Rollback:
// - Korean typing in browser breaks → flip SUBSET_FONT to false
// - Fields appear blank in some viewer → flip NEED_APPEARANCES to 'true'
// - Template/font changes not picked up → flip CACHE_ASSETS to false (dev)
const PDF_SUBSET_FONT = true
const PDF_CACHE_ASSETS = true
const PDF_NEED_APPEARANCES: 'false' | 'true' | 'unset' = 'false'

const assetCache: { template: Map<string, Buffer>; font: Buffer | null; signature: Map<string, Buffer> } = {
  template: new Map(),
  font: null,
  signature: new Map(),
}

async function loadSignatureImage(name: string): Promise<Buffer> {
  if (PDF_CACHE_ASSETS) {
    const cached = assetCache.signature.get(name)
    if (cached) return cached
  }
  const buf = await readFile(path.join(process.cwd(), 'public', 'signatures', name))
  if (PDF_CACHE_ASSETS) assetCache.signature.set(name, buf)
  return buf
}

async function loadTemplate(name: string): Promise<Buffer> {
  if (PDF_CACHE_ASSETS) {
    const cached = assetCache.template.get(name)
    if (cached) return cached
  }
  const buf = await readFile(path.join(process.cwd(), 'data', 'pdf-templates', name))
  if (PDF_CACHE_ASSETS) assetCache.template.set(name, buf)
  return buf
}

async function loadFontBytes(): Promise<Buffer> {
  if (PDF_CACHE_ASSETS && assetCache.font) return assetCache.font
  const buf = await readFile(path.join(process.cwd(), 'data', 'fonts', 'NanumGothic.ttf'))
  if (PDF_CACHE_ASSETS) assetCache.font = buf
  return buf
}

type FieldMapping = {
  source: string | null
  transform?: string
  default?: string
  note?: string
  /** Text alignment in the rendered widget. Default is left (PDF default). */
  align?: 'left' | 'center' | 'right'
}

type SignatureOverlay = {
  image: string
  page?: number
  x: number
  y: number
  w: number
  h: number
}

type FormMapping = {
  template: string
  description: string
  filename: string
  /**
   * Optional date format override for the entire form's output.
   * 'dmy' — convert to dd/mm/yyyy (e.g. Annex III).
   * 'ymd_slash' — normalize to YYYY/MM/DD with zero-padded month/day (e.g. Form25).
   * Default (undefined) preserves the transform's output.
   */
  dateFormat?: 'dmy' | 'ymd_slash' | 'dmmmy'
  fields: Record<string, FieldMapping>
  /** Optional signature/stamp image overlays — applied only when caller opts in. */
  signatures?: SignatureOverlay[]
  /**
   * Static text overlays always drawn onto the generated PDF. Use for
   * hard-coded values in cells that have no form field (e.g. AU Babesia row
   * always "N/A" because Korea-origin dogs never visit mainland Africa).
   * Coordinates are PDF user-space (origin = bottom-left), size defaults to 10pt.
   */
  textOverlays?: { page?: number; x: number; y: number; text: string; size?: number }[]
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

/**
 * Hardcoded active ingredient + dose rate strings for parasiticide products
 * used by the AU certificate's parasite rows. Keys match product_id values
 * defined in PARASITE_FAMILIES (lib/vaccine-lookup.ts).
 * Dose strings are per-product manufacturer instructions in English for AU.
 */
const PARASITE_PRODUCT_INFO: Record<string, { ingredient: string; dose: string }> = {
  frontline_plus_dog:  { ingredient: 'Fipronil', dose: '1 vial' },
  frontline_spray_cat: { ingredient: 'Fipronil', dose: '1 vial' },
  drontal_plus_dog:    { ingredient: 'Pyrantel Pamoate, Praziquantel, Febantel', dose: '1 tablet per 10 kg body weight' },
  drontal_plus_cat:    { ingredient: 'Pyrantel Pamoate, Praziquantel', dose: '1 tablet per 4 kg body weight' },
}

/** sex code → English label used by Annex III (N. = neutered/spayed). */
const SEX_LABEL_EN: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  neutered_male: 'N. male',
  spayed_female: 'N. female',
}

/**
 * Destinations that require echinococcus (tapeworm) treatment for dogs.
 * Annex III's parasite section is only filled when the case destination
 * matches one of these — other EU/EEA destinations leave the rows blank.
 */
const TAPEWORM_REQUIRED_DESTINATIONS = [
  '영국', '아일랜드', '몰타', '북아일랜드', '노르웨이', '핀란드',
]

function destinationRequiresTapeworm(dest: unknown): boolean {
  if (typeof dest !== 'string' || !dest) return false
  return dest.split(',').map(s => s.trim()).some(d => TAPEWORM_REQUIRED_DESTINATIONS.includes(d))
}

/** Echinococcus treatment is required for dogs only — cats are exempt. */
function requiresTapewormForCase(caseRow: CaseRow, data: Record<string, unknown>): boolean {
  if (!destinationRequiresTapeworm(caseRow.destination)) return false
  const species = String(data.species ?? '').toLowerCase()
  return species === 'dog'
}

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

// Korean phone → +82-AREA-XXXX-YYYY. Seoul (02) keeps 1-digit area code,
// everything else uses 2-digit. Subscriber part splits so the tail is 4 digits
// when ≥7 digits remain, else 3.
function fmtPhoneIntlKr(raw: unknown): string {
  let s = String(raw ?? '').replace(/\D/g, '')
  if (!s) return ''
  if (s.startsWith('82')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  if (!s) return ''
  const areaLen = s.startsWith('2') ? 1 : 2
  const area = s.slice(0, areaLen)
  const rest = s.slice(areaLen)
  if (!rest) return `+82-${area}`
  const tailLen = rest.length >= 7 ? 4 : 3
  if (rest.length <= tailLen) return `+82-${area}-${rest}`
  return `+82-${area}-${rest.slice(0, rest.length - tailLen)}-${rest.slice(-tailLen)}`
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
  /** Product (batch) expiry — catalog's `expiry` field. Empty when unknown
   * (e.g. parasiticide without batch-level expiry data). Used by Form25AuNz's
   * serial_with_expiry renderer which must show batch + expiry in one cell. */
  expiry: string
  date: string
}
function buildOtherVaccineSequence(data: Record<string, unknown>, allowedVaccines?: string[]): OtherVacEntry[] {
  const species = String(data.species ?? '').toLowerCase()
  const hasSpecies = species === 'dog' || species === 'cat'
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const out: OtherVacEntry[] = []

  // 1. 종합백신 (Comprehensive — Vaccination)
  const gv = (!allowedVaccines || allowedVaccines.includes('general')) ? sortedDesc(data.general_vaccine_dates)[0] : undefined
  if (gv) {
    const p = hasSpecies ? lookupComprehensive(species as 'dog' | 'cat', gv) : null
    out.push({
      type: 'Vaccination',
      name: p?.vaccine || p?.product || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      expiry: fmtDate(p?.expiry ?? ''),
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
        expiry: fmtDate(p?.expiry ?? ''),
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
      expiry: fmtDate(p?.expiry ?? ''),
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

  const ext = (!allowedVaccines || allowedVaccines.includes('external_parasite')) ? sortedDescRecords(data.external_parasite_dates)[0] : undefined
  if (ext) {
    const k = dedupKey(ext)
    if (k) seenComboKeys.add(k)
    out.push(buildParasite(ext, 'external'))
  }

  const int = (!allowedVaccines || allowedVaccines.includes('internal_parasite')) ? sortedDescRecords(data.internal_parasite_dates)[0] : undefined
  if (int) {
    const k = dedupKey(int)
    if (!(k && seenComboKeys.has(k))) {
      out.push(buildParasite(int, 'internal'))
    }
  }

  return out
}

/**
 * 확장된 버전 — 호주/뉴질랜드/괌용 별지 제25호 서식(8슬롯)에서 사용.
 * 우선순위: 종합백신 → CIV → 켄넬코프 → 외부구충 → 내부구충.
 * 각 타입당 최대 maxPerType(기본 3)회차를 과거→최신 순으로 출력.
 * 콤보 구충제는 external에서만 표시, internal 동기화 기록은 스킵.
 */
function buildExpandedVaccineSequence(data: Record<string, unknown>, maxPerType = 3, allowedVaccines?: string[]): OtherVacEntry[] {
  const species = String(data.species ?? '').toLowerCase()
  const hasSpecies = species === 'dog' || species === 'cat'
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const out: OtherVacEntry[] = []

  // Helper: pick latest N records (by date), returned in ascending (oldest→newest) order.
  const latestAscending = (records: unknown): ParasiteRecord[] => {
    const sorted = sortedDescRecords(records).slice(0, maxPerType)
    return sorted.slice().reverse()
  }

  // 1. 종합백신 (Vaccination)
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('general')) ? latestAscending(data.general_vaccine_dates) : [])) {
    const p = hasSpecies ? lookupComprehensive(species as 'dog' | 'cat', rec.date) : null
    out.push({
      type: 'Vaccination',
      name: p?.vaccine || p?.product || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      expiry: fmtDate(p?.expiry ?? ''),
      date: fmtDate(rec.date),
    })
  }

  // 2. CIV (Vaccination)
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('civ')) ? latestAscending(data.civ_dates) : [])) {
    const p = lookupCiv(rec.date)
    out.push({
      type: 'Vaccination',
      name: p?.vaccine || p?.product || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      expiry: fmtDate(p?.expiry ?? ''),
      date: fmtDate(rec.date),
    })
  }

  // 3. 켄넬코프 (Vaccination)
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('kennel')) ? latestAscending(data.kennel_cough_dates) : [])) {
    const p = lookupKennelCough()
    out.push({
      type: 'Vaccination',
      name: p?.vaccine || p?.product || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      expiry: fmtDate(p?.expiry ?? ''),
      date: fmtDate(rec.date),
    })
  }

  // Collect combo keys from external so internal can skip duplicates.
  const externalRecords = (!allowedVaccines || allowedVaccines.includes('external_parasite')) ? latestAscending(data.external_parasite_dates) : []
  const comboKeysFromExternal = new Set<string>()
  for (const rec of externalRecords) {
    if (rec.product_id && getParasiteFamily(rec.product_id)?.kind === 'combo') {
      comboKeysFromExternal.add(`${rec.product_id}@${rec.date}`)
    }
  }

  const pushParasite = (rec: ParasiteRecord, side: 'external' | 'internal') => {
    if (rec.product_id) {
      const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
      out.push({
        type: 'Parasiticide',
        name: p?.product || '',
        manufacturer: p?.manufacturer ?? '',
        serial: p?.batch ?? '',
        expiry: fmtDate(p?.expiry ?? ''),
        date: fmtDate(rec.date),
      })
      return
    }
    const p = hasSpecies
      ? (side === 'external'
          ? lookupExternalParasite(species as 'dog' | 'cat', rec.date)
          : lookupInternalParasite(species as 'dog' | 'cat', rec.date))
      : null
    out.push({
      type: 'Parasiticide',
      name: p?.product || p?.vaccine || '',
      manufacturer: p?.manufacturer ?? '',
      serial: p?.batch ?? '',
      expiry: fmtDate(p?.expiry ?? ''),
      date: fmtDate(rec.date),
    })
  }

  // 4. 외부구충 (Parasiticide) — combos included here.
  for (const rec of externalRecords) pushParasite(rec, 'external')

  // 5. 내부구충 (Parasiticide) — skip records that were already emitted via external combo.
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('internal_parasite')) ? latestAscending(data.internal_parasite_dates) : [])) {
    if (rec.product_id && getParasiteFamily(rec.product_id)?.kind === 'combo') {
      if (comboKeysFromExternal.has(`${rec.product_id}@${rec.date}`)) continue
    }
    pushParasite(rec, 'internal')
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
  // address_overseas: 폴백 없음 — 비어있으면 그대로 비움 (목적지 해외 주소는 한국 주소로 대체 불가)
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

  // Composite animal description: "<breed>, <color>, <weight>kg".
  // Used by Identification Declaration's Description / Breed-color-size fields.
  // Drops empty parts; weight gets a "kg" suffix only when present.
  if (source === 'animal_description') {
    const breed = String(data.breed_en ?? '').trim()
    const color = String(data.color_en ?? '').trim()
    const weightRaw = String(data.weight ?? '').trim()
    const parts: string[] = []
    if (breed) parts.push(breed)
    if (color) parts.push(color)
    if (weightRaw) parts.push(`${weightRaw}kg`)
    return parts.join(', ')
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
  allowedVaccines?: string[],
): Resolved {
  const { source, transform } = mapping
  const raw = source ? readSource(source, caseRow, data) : null

  // Date fallback to today when source is empty (e.g. 내원일 없으면 발급일을 오늘로)
  if (transform === 'date_or_today') {
    if (raw && String(raw).trim()) return String(raw)
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

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

  // Extract a string field from a JSON object source.
  // Pattern: `json:<key>` — returns raw[key] as string, empty if missing.
  // Used by AU form for data.australia_extra.{permit_no, id_date, sample_received_date}.
  const jsonMatch = transform?.match(/^json:(.+)$/)
  if (jsonMatch) {
    if (!raw || typeof raw !== 'object') return ''
    const v = (raw as Record<string, unknown>)[jsonMatch[1]]
    return v == null ? '' : String(v)
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

  // Australia disease test gating (AU certificate, p2).
  // Pattern: `au_disease:<leishmania|leptospira|brucella>:(date|result)`
  // Applicability is derived from case state — no UI toggle:
  //   leishmania: always applicable (Australia always tests)
  //   brucella:   only when the dog is NOT neutered/spayed (intact male or female)
  //   leptospira: only when no Leptospira-containing vaccine has been given
  //               (heuristic: no general_vaccine_dates entries)
  // When applicable → date pulled from infectious_disease_records[0].date,
  // result is the literal "Negative". Otherwise returns '' so mapping.default ("N/A") applies.
  const auDiseaseMatch = transform?.match(/^au_disease:(leishmania|leptospira|brucella):(date|result)$/)
  if (auDiseaseMatch) {
    const disease = auDiseaseMatch[1]
    const attr = auDiseaseMatch[2]
    let applicable = false
    if (disease === 'leishmania') {
      applicable = true
    } else if (disease === 'brucella') {
      const sex = String(data.sex ?? '').toLowerCase()
      applicable = sex === 'male' || sex === 'female'
    } else if (disease === 'leptospira') {
      const gv = data.general_vaccine_dates
      applicable = !Array.isArray(gv) || gv.length === 0
    }
    if (!applicable) return ''
    if (attr === 'result') return 'Negative'
    // attr === 'date' — pull the most recent infectious_disease_records date
    const recs = data.infectious_disease_records
    if (!Array.isArray(recs) || recs.length === 0) return ''
    const rec = recs[0] as { date?: string | null }
    return rec.date ? fmtDate(rec.date) : ''
  }

  // Active ingredient / dose-rate lookup for AU parasite rows.
  // Pattern: `parasite_info:(external|internal):(ingredient|dose)[<n>]` (desc order)
  // Resolves the product by (1) rec.product_id when set, (2) falling back to
  // species+kind→default product_id mapping so records saved without an
  // explicit product selection still render (matches the Product name
  // column's species/date-based lookup behavior).
  const parInfoMatch = transform?.match(/^parasite_info:(external|internal):(ingredient|dose)\[(\d+)\]$/)
  if (parInfoMatch) {
    const side = parInfoMatch[1] as 'external' | 'internal'
    const attr = parInfoMatch[2]
    const idx = Number(parInfoMatch[3])
    const records = sortedDescRecords(raw)
    const rec = records[idx]
    if (!rec) return ''
    const species = String(data.species ?? '').toLowerCase()
    const defaultIds: Record<'external' | 'internal', Record<string, string>> = {
      external: { dog: 'frontline_plus_dog', cat: 'frontline_spray_cat' },
      internal: { dog: 'drontal_plus_dog',   cat: 'drontal_plus_cat' },
    }
    const pid = rec.product_id || defaultIds[side][species]
    const info = pid ? PARASITE_PRODUCT_INFO[pid] : undefined
    if (!info) return ''
    if (attr === 'ingredient') return info.ingredient
    if (attr === 'dose') return info.dose
    return ''
  }

  // Phone formatting: raw digits → 010-XXXX-XXXX.
  if (transform === 'phone_dash') {
    return fmtPhoneDash(raw)
  }

  if (transform === 'phone_intl_kr') {
    return fmtPhoneIntlKr(raw)
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
    const entry = buildOtherVaccineSequence(data, allowedVaccines)[idx]
    return entry ? entry[attr] : ''
  }

  // Form25AuNz expanded filler (8 slots, 3 doses per type).
  // Order: 종합백신 → CIV → 켄넬코프(미구현) → 외부구충 → 내부구충.
  // `serial_with_expiry` — AU/NZ variant that combines batch + product expiry
  // into one cell (e.g. "G98321 / 2027-10-07"). Empty string when no entry.
  const expSeqMatch = transform?.match(/^expanded_vacc_seq:(type|name|manufacturer|serial|serial_with_expiry|date)\[(\d+)\]$/)
  if (expSeqMatch) {
    const attr = expSeqMatch[1]
    const idx = Number(expSeqMatch[2])
    const entry = buildExpandedVaccineSequence(data, 3, allowedVaccines)[idx]
    if (!entry) return ''
    if (attr === 'serial_with_expiry') {
      return entry.expiry ? `${entry.serial} / ${entry.expiry}` : entry.serial
    }
    return entry[attr as keyof OtherVacEntry]
  }

  // Annex III vaccination row — echo microchip/implant date only when Nth rabies dose exists.
  // Pattern: `vacc_row_field:(transponder|implant)[n]`.
  const vaccRowFieldMatch = transform?.match(/^vacc_row_field:(transponder|implant)\[(\d+)\]$/)
  if (vaccRowFieldMatch) {
    const attr = vaccRowFieldMatch[1]
    const idx = Number(vaccRowFieldMatch[2])
    // source provides microchip (string). Need oldest-first rabies date existence check.
    const rabies = sortedAsc(data.rabies_dates)
    if (!rabies[idx]) return ''
    if (attr === 'transponder') return String(raw ?? '')
    if (attr === 'implant') {
      const impl = data.microchip_implant_date
      return typeof impl === 'string' ? fmtDate(impl) : ''
    }
    return ''
  }

  // Annex III titer — oldest-first date at index n.
  const titerAscMatch = transform?.match(/^titer_date_asc\[(\d+)\]$/)
  if (titerAscMatch && source === 'rabies_titer_records') {
    const idx = Number(titerAscMatch[1])
    const asc = sortedTiters(raw).slice().reverse()
    const rec = asc[idx]
    return rec ? fmtDate(rec.date) : ''
  }

  // Annex III parasite row — echo microchip/product/date/vet from Nth internal parasite entry.
  // Pattern: `annex_parasite:(transponder|product|date|vet)[n]` — oldest-first.
  // Only filled when the destination requires echinococcus treatment (UK/IE/MT/NI/NO/FI).
  // Other EU/EEA destinations leave these rows blank.
  // `raw` comes from the mapping's source — `microchip` for transponder,
  // `internal_parasite_dates` for the rest — so we don't use it directly here.
  const annexParMatch = transform?.match(/^annex_parasite:(transponder|product|date|vet)\[(\d+)\]$/)
  if (annexParMatch) {
    if (!requiresTapewormForCase(caseRow, data)) return ''
    const attr = annexParMatch[1]
    const idx = Number(annexParMatch[2])
    const records = sortedDescRecords(data.internal_parasite_dates).slice().reverse()
    const rec = records[idx]
    if (!rec) return ''
    if (attr === 'transponder') {
      const mc = (caseRow as unknown as Record<string, unknown>).microchip
      return typeof mc === 'string' ? mc : ''
    }
    if (attr === 'date') return fmtDate(rec.date)
    if (attr === 'vet') return 'Jinwon Lee'
    if (attr === 'product') {
      const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
      const species = String(data.species ?? '').toLowerCase()
      if (rec.product_id) {
        const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
        return p?.product ?? ''
      }
      if (species === 'dog' || species === 'cat') {
        const p = lookupInternalParasite(species, rec.date)
        return p?.product || p?.vaccine || ''
      }
      return ''
    }
    return ''
  }

  // Desc variant — row 0 = most recent dose. Used by AU form where the first
  // listed row should be the current/latest treatment. Supports the same kinds
  // as `vaccine:...` plus `civ` (CIV uses lookupCiv).
  // For civ, validity_to/validity_from fall back to vaccinationDate ± 1 year
  // because lookupCiv doesn't compute an explicit immunity window.
  const vacDescMatch = transform?.match(/^vaccine_desc:(rabies|ext_parasite|int_parasite|civ|comprehensive):(name|manufacturer|serial|date|validity_from|validity_to)\[(\d+)\]$/)
  if (vacDescMatch) {
    const kind = vacDescMatch[1]
    const attr = vacDescMatch[2]
    const idx = Number(vacDescMatch[3])
    const date = sortedDesc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    if ((kind === 'civ' || kind === 'comprehensive') && attr === 'validity_from') return fmtDate(date)
    if ((kind === 'civ' || kind === 'comprehensive') && attr === 'validity_to') {
      // vaccinationDate + 1 year as YYYY-MM-DD → fmtDate → YYYY/MM/DD (form-level dmy converts to dd/mm/yyyy)
      const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return ''
      return `${Number(m[1]) + 1}/${m[2]}/${m[3]}`
    }
    const species = String(data.species ?? '').toLowerCase()
    let p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null; validityFrom?: string; validityTo?: string } | null = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'civ') p = lookupCiv(date)
    else if (kind === 'comprehensive' && (species === 'dog' || species === 'cat')) p = lookupComprehensive(species, date)
    else if (kind === 'ext_parasite' && (species === 'dog' || species === 'cat')) p = lookupExternalParasite(species, date)
    else if (kind === 'int_parasite' && (species === 'dog' || species === 'cat')) p = lookupInternalParasite(species, date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    if (attr === 'validity_from') return fmtDate(p.validityFrom ?? '')
    if (attr === 'validity_to') return fmtDate(p.validityTo ?? '')
    return ''
  }

  // AU certificate — combined rabies vaccine info across all doses.
  // Pattern: `vaccine_combined:rabies:(name|serial|product_expiry|booster_due)`
  // Source: rabies_dates. Joins distinct per-dose values with " / " so that
  // certificates with 2 shots show both products/batches when they differ
  // and collapse to a single value when identical.
  //   - product_expiry: catalog batch expiry (same batch → one value, different → joined)
  //   - booster_due: always latest (newest) dose + 1y, regardless of dose count
  //   - others: per-dose values (asc — oldest first), deduped, joined by " / "
  const vacCombinedMatch = transform?.match(/^vaccine_combined:rabies:(name|serial|product_expiry|booster_due)$/)
  if (vacCombinedMatch) {
    const attr = vacCombinedMatch[1]
    const dates = sortedAsc(raw)
    if (dates.length === 0) return ''
    if (attr === 'booster_due') {
      const latest = dates[dates.length - 1]
      const m = latest.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return ''
      return fmtDate(`${Number(m[1]) + 1}-${m[2]}-${m[3]}`)
    }
    const values = dates.map(d => {
      const p = lookupRabies(d) as (ReturnType<typeof lookupRabies> & { expiry?: string }) | null
      if (!p) return ''
      if (attr === 'name') return p.vaccine || p.product || ''
      if (attr === 'serial') return p.batch ?? ''
      if (attr === 'product_expiry') return fmtDate(p.expiry ?? '')
      return ''
    }).filter(Boolean)
    if (values.length === 0) return ''
    const unique = Array.from(new Set(values))
    return unique.join(' / ')
  }

  // Vaccine attribute accessors for rabies / external / internal parasites.
  // Pattern: `vaccine:<kind>:<attr>[<n>]` where
  //   kind = rabies | ext_parasite | int_parasite
  //   attr = name | manufacturer | serial | date | validity_from | validity_to
  // validity_from/to are only defined for rabies (uses lookupRabies's 1-year window).
  // `serial_with_expiry` attr concatenates batch + product expiry, used by
  // Form25AuNz where rows need "batch / 2027-10-07" in the batch cell.
  const vacMatch = transform?.match(/^vaccine:(rabies|ext_parasite|int_parasite):(name|manufacturer|serial|serial_with_expiry|date|validity_from|validity_to)\[(\d+)\]$/)
  if (vacMatch) {
    const kind = vacMatch[1]
    const attr = vacMatch[2]
    const idx = Number(vacMatch[3])
    // Oldest-first ordering: row 1 = first dose, row 2 = second, etc.
    const date = sortedAsc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    const species = String(data.species ?? '').toLowerCase()
    let p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null; expiry?: string | null; validityFrom?: string; validityTo?: string } | null = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'ext_parasite' && (species === 'dog' || species === 'cat')) p = lookupExternalParasite(species, date)
    else if (kind === 'int_parasite' && (species === 'dog' || species === 'cat')) p = lookupInternalParasite(species, date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    if (attr === 'serial_with_expiry') {
      const batch = p.batch ?? ''
      const expiry = fmtDate(p.expiry ?? '')
      return expiry ? (batch ? `${batch} / ${expiry}` : expiry) : batch
    }
    if (attr === 'validity_from') return fmtDate(p.validityFrom ?? '')
    if (attr === 'validity_to') return fmtDate(p.validityTo ?? '')
    return ''
  }

  // Text transforms
  if (transform === 'en' && source === 'species') {
    return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  }

  if (transform === 'sex_label') {
    return SEX_LABEL_EN[String(raw ?? '').toLowerCase()] ?? ''
  }

  // Split an address string into street vs locality portions for forms
  // that expose two address fields (Annex III I1/I5 consignor/consignee).
  // Heuristic: keep the last 3 comma-separated segments (city/region/country)
  // as locality; everything before as street. Degrades gracefully when the
  // address has fewer segments.
  //   parts.length - 3 segments → street, rest → locality (min 1 for street)
  // Examples:
  //   "3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea"
  //     street   = "3, Gwanak-ro 29-gil"
  //     locality = "Gwanak-gu, Seoul, Republic of Korea"
  //   "10 Berlin Str, 10115 Berlin, Germany"
  //     street   = "10 Berlin Str"
  //     locality = "10115 Berlin, Germany"
  const addrMatch = transform?.match(/^address_part:(street|locality)$/)
  if (addrMatch) {
    const part = addrMatch[1]
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!s) return ''
    const segments = s.split(',').map(seg => seg.trim()).filter(Boolean)
    if (segments.length <= 1) return part === 'street' ? s : ''
    const streetCount = Math.max(1, segments.length - 3)
    if (part === 'street') return segments.slice(0, streetCount).join(', ')
    return segments.slice(streetCount).join(', ')
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
    // Generic string[] / primitive[] fallback (used by e.g. microchip_extra).
    if (Array.isArray(raw) && !prop) {
      const v = raw[idx]
      return v == null ? '' : String(v)
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

/**
 * Compute the largest font size that fits a text field's box for its current text.
 * - Height cap: 85% of widget height (leaves baseline/descender room).
 * - Width cap: linear scale from font.widthOfTextAtSize(text, 1).
 * - For multi-widget fields, uses the most constrained widget.
 * - Multi-line fields: approximates via line-count estimate.
 * - Clamped to [5, 24] pt and rounded down to 0.5pt.
 * Returns 0 when there is no text, which signals pdf-lib to use its default.
 */
function computeMaxFontSize(
  tf: import('pdf-lib').PDFTextField,
  text: string,
  font: import('pdf-lib').PDFFont,
): number {
  if (!text) return 0
  const widgets = tf.acroField.getWidgets()
  if (widgets.length === 0) return 0

  const isMultiline = tf.isMultiline()
  const HORIZ_PAD = 2
  const VERT_PAD = 0.5
  const HEIGHT_MULT = 0.9
  const MIN_SIZE = 5
  const MAX_SIZE = 24

  let minSize = Infinity
  for (const w of widgets) {
    const rect = w.getRectangle()
    const availW = Math.max(1, rect.width - 2 * HORIZ_PAD)
    const availH = Math.max(1, rect.height - 2 * VERT_PAD)

    const widthAt1pt = font.widthOfTextAtSize(text, 1)
    let widthLimit = widthAt1pt > 0.001 ? availW / widthAt1pt : MAX_SIZE

    let heightLimit: number
    if (isMultiline) {
      // Approximation: assume text wraps, estimate line count by total width.
      // lines ≈ ceil((widthAt1pt * size) / availW); require lines * size * 1.2 ≤ availH.
      // Solving for size: quadratic — use a simple iterative fit.
      heightLimit = Math.min(availH * HEIGHT_MULT, MAX_SIZE)
      let s = heightLimit
      for (let i = 0; i < 8; i++) {
        const textW = widthAt1pt * s
        const lines = Math.max(1, Math.ceil(textW / availW))
        const needed = lines * s * 1.2
        if (needed <= availH) break
        s *= (availH / needed) * 0.98
      }
      widthLimit = s
      heightLimit = s
    } else {
      heightLimit = availH * HEIGHT_MULT
    }

    const size = Math.min(heightLimit, widthLimit)
    if (size < minSize) minSize = size
  }

  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, minSize))
  return Math.floor(clamped * 2) / 2
}

export type FillResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

/* ─────────────────────────── Multi-case packing ──────────────────────────
 * Annex III (EU) and UK forms accept multiple animals in a single document
 * when the same customer travels with several pets. Rows are a shared
 * resource: each animal consumes 1 rabies-vaccination row per dose it has
 * (minimum 1 even if no rabies record exists). Animal identity rows and
 * parasite rows are allocated 1 per animal.
 *
 * Annex: animals ≤ 3, vacc rows ≤ 5.
 * UK:    animals ≤ 5, vacc rows ≤ 5.
 *
 * Cases that don't fit in one document spill into the next document, etc.
 */

interface VaccSlot { caseIdx: number; doseIdx: number }

interface PackedDoc {
  cases: CaseRow[]
  vaccSlots: VaccSlot[]      // vaccSlots[rowIdx] = {caseIdx within doc, doseIdx}
  animalSlots: number[]      // animalSlots[rowIdx] = caseIdx within doc
  parasiteSlots: number[]    // parasiteSlots[rowIdx] = caseIdx within doc
}

interface FormCapacity { animals: number; vaccRows: number }

const FORM_CAPACITY: Record<string, FormCapacity | undefined> = {
  AnnexIII: { animals: 3, vaccRows: 5 },
  UK:       { animals: 5, vaccRows: 5 },
}

function rabiesDoseCount(c: CaseRow): number {
  const data = (c.data ?? {}) as Record<string, unknown>
  const dates = data.rabies_dates
  if (!Array.isArray(dates)) return 0
  return dates
    .map(d => (typeof d === 'string' ? d : (d as { date?: string })?.date))
    .filter((d): d is string => typeof d === 'string' && !!d)
    .length
}

export function packCases(formKey: string, cases: CaseRow[]): PackedDoc[] {
  const cap = FORM_CAPACITY[formKey]
  if (!cap) return [{ cases, vaccSlots: [], animalSlots: cases.map((_, i) => i), parasiteSlots: cases.map((_, i) => i) }]

  const docs: PackedDoc[] = []
  let remaining = cases.slice()
  while (remaining.length > 0) {
    const doc: PackedDoc = { cases: [], vaccSlots: [], animalSlots: [], parasiteSlots: [] }
    const leftover: CaseRow[] = []
    for (const c of remaining) {
      const doses = Math.max(1, rabiesDoseCount(c))
      if (doc.cases.length >= cap.animals || doc.vaccSlots.length + doses > cap.vaccRows) {
        leftover.push(c)
        continue
      }
      const caseIdx = doc.cases.length
      doc.cases.push(c)
      doc.animalSlots.push(caseIdx)
      doc.parasiteSlots.push(caseIdx)
      for (let d = 0; d < doses; d++) doc.vaccSlots.push({ caseIdx, doseIdx: d })
    }
    if (doc.cases.length === 0) {
      // Single case alone exceeds capacity — fail hard.
      throw new Error(`Case exceeds form capacity: ${remaining[0].id}`)
    }
    docs.push(doc)
    remaining = leftover
  }
  return docs
}

/**
 * Parse a row-based field name like `I28_row2_species` or `vacc_row3_vacc_date`.
 * Returns row kind + 0-indexed row number, or null if not a row field.
 */
function parseRowField(fieldName: string): { kind: 'animal' | 'vacc' | 'parasite'; rowIdx: number } | null {
  let m = fieldName.match(/^(?:I28|I12)_row(\d+)_/)
  if (m) return { kind: 'animal', rowIdx: Number(m[1]) - 1 }
  m = fieldName.match(/^vacc_row(\d+)_/)
  if (m) return { kind: 'vacc', rowIdx: Number(m[1]) - 1 }
  m = fieldName.match(/^parasite_row(\d+)_/)
  if (m) return { kind: 'parasite', rowIdx: Number(m[1]) - 1 }
  return null
}

/** Rewrite the `[N]` index at the tail of a transform string. */
function rewriteTransformIndex(transform: string | undefined, newIdx: number): string | undefined {
  if (!transform) return transform
  return transform.replace(/\[\d+\]$/, `[${newIdx}]`)
}

/**
 * Resolve one field for a multi-case document.
 * Row-based fields pick their target case+dose from the pack map and reuse row 1's
 * mapping as a template (with index rewritten). Non-row fields use the primary case.
 */
/** Multi-case aggregate transforms used by Annex III / UK non-row fields. */
function resolveMultiTransform(transform: string | undefined, doc: PackedDoc): string | null {
  if (!transform) return null

  if (transform === 'multi:species_en') {
    const kinds = new Set<string>()
    for (const c of doc.cases) {
      const sp = String((c.data as Record<string, unknown>)?.species ?? '').toLowerCase()
      if (SPECIES_EN[sp]) kinds.add(SPECIES_EN[sp])
    }
    if (kinds.size === 0) return ''
    if (kinds.size === 1) return [...kinds][0]
    // Pluralize + join for mixed-species shipments.
    const parts = [...kinds].map(k => `${k}s`)
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
  }

  if (transform === 'multi:count') {
    return String(doc.cases.length)
  }

  const mcMatch = transform.match(/^multi:microchip\[(\d+)\]$/)
  if (mcMatch) {
    const idx = Number(mcMatch[1])
    const c = doc.cases[idx]
    if (!c) return ''
    const mc = (c as unknown as Record<string, unknown>).microchip
    return typeof mc === 'string' ? mc : ''
  }

  return null
}

function resolveFieldMulti(
  fieldName: string,
  allFields: Record<string, FieldMapping>,
  doc: PackedDoc,
  allowedVaccines?: string[],
): Resolved {
  const mapping = allFields[fieldName]

  // Multi-case aggregates (description, quantity, declaration transponders, …)
  // take precedence before we dispatch by field name.
  const agg = resolveMultiTransform(mapping?.transform, doc)
  if (agg !== null) return agg

  const parsed = parseRowField(fieldName)
  if (!parsed) {
    const primary = doc.cases[0]
    return resolveField(mapping, primary, (primary.data ?? {}) as Record<string, unknown>, allowedVaccines)
  }

  let targetCaseIdx: number | undefined
  let newIdx: number | null = null
  if (parsed.kind === 'animal') {
    targetCaseIdx = doc.animalSlots[parsed.rowIdx]
  } else if (parsed.kind === 'vacc') {
    const slot = doc.vaccSlots[parsed.rowIdx]
    if (slot) { targetCaseIdx = slot.caseIdx; newIdx = slot.doseIdx }
  } else {
    targetCaseIdx = doc.parasiteSlots[parsed.rowIdx]
    if (targetCaseIdx !== undefined) newIdx = 0  // most recent parasite dose per animal
  }

  if (targetCaseIdx === undefined) return ''

  const templateName = fieldName.replace(/_row\d+_/, '_row1_')
  const templateMapping = allFields[templateName]
  if (!templateMapping) return ''

  const finalMapping: FieldMapping = newIdx != null
    ? { ...templateMapping, transform: rewriteTransformIndex(templateMapping.transform, newIdx) }
    : templateMapping

  const target = doc.cases[targetCaseIdx]
  return resolveField(finalMapping, target, (target.data ?? {}) as Record<string, unknown>, allowedVaccines)
}

export async function fillPdfMulti(formKey: string, cases: CaseRow[]): Promise<FillResult[]> {
  if (cases.length === 0) return [{ ok: false, error: '대상 동물이 없습니다' }]
  let docs: PackedDoc[]
  try { docs = packCases(formKey, cases) }
  catch (e) { return [{ ok: false, error: (e as Error).message }] }

  const results: FillResult[] = []
  for (let i = 0; i < docs.length; i++) {
    const r = await fillOnePackedDoc(formKey, docs[i], docs.length > 1 ? i + 1 : 0)
    results.push(r)
  }
  return results
}

async function fillOnePackedDoc(formKey: string, doc: PackedDoc, partNumber: number): Promise<FillResult> {
  const form = MAPS[formKey]
  if (!form) return { ok: false, error: `Unknown form: ${formKey}` }

  let templateBytes: Buffer
  try { templateBytes = await loadTemplate(form.template) }
  catch { return { ok: false, error: `템플릿을 찾을 수 없습니다: ${form.template}` } }

  const pdf = await PDFDocument.load(templateBytes)
  pdf.registerFontkit(fontkit)
  const fontBytes = await loadFontBytes()
  const customFont = await pdf.embedFont(fontBytes, { subset: PDF_SUBSET_FONT })

  const pdfForm = pdf.getForm()

  const toDmy = (s: string): string => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
  const toSlashYmd2 = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const toDmmmY = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${String(d).padStart(2, '0')}/${MONTHS_SHORT[Number(m) - 1] ?? m}/${y}`)
  // vaccine_combined may join multiple dates with " / ". Apply the format to
  // each part so combined expiry/booster fields render in the form's date style.
  const eachPart = (fn: (s: string) => string) => (s: string) =>
    s.includes(' / ') ? s.split(' / ').map(fn).join(' / ') : fn(s)
  const reformatDate = form.dateFormat === 'dmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toDmy)(s) : s)
    : form.dateFormat === 'ymd_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toSlashYmd2)(s) : s)
    : form.dateFormat === 'dmmmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toDmmmY)(s) : s)
    : (s: unknown): unknown => s

  for (const [fieldName, mapping] of Object.entries(form.fields)) {
    const value = reformatDate(resolveFieldMulti(fieldName, form.fields, doc))
    let field
    try { field = pdfForm.getField(fieldName) } catch { continue }
    const type = field.constructor.name
    if (type === 'PDFCheckBox') {
      if (value === true) (field as import('pdf-lib').PDFCheckBox).check()
      else (field as import('pdf-lib').PDFCheckBox).uncheck()
    } else if (type === 'PDFTextField') {
      let text = typeof value === 'string' ? value : ''
      // Fall back to mapping.default when a transform returned empty.
      // This lets us set `"default": "N/A"` on row/slot fields that should
      // show "N/A" whenever the underlying data is missing (e.g. optional
      // test rows, skipped vaccine doses).
      if (!text && mapping.default) text = mapping.default
      // Always setText (even to '') so any template default text is cleared.
      const tf = field as import('pdf-lib').PDFTextField
      tf.setText(text)
      if (mapping.align) {
        tf.setAlignment(
          mapping.align === 'center' ? TextAlignment.Center
          : mapping.align === 'right' ? TextAlignment.Right
          : TextAlignment.Left,
        )
      }
    }
  }

  await applyFontFixes(pdf, pdfForm, customFont)

  // Static text overlays — applied in multi-case path too.
  if (form.textOverlays?.length) {
    const pages = pdf.getPages()
    for (const t of form.textOverlays) {
      const page = pages[t.page ?? 0]
      if (!page) continue
      page.drawText(t.text, { x: t.x, y: t.y, size: t.size ?? 10, font: customFont })
    }
  }

  const bytes = await pdf.save()
  const base64 = Buffer.from(bytes).toString('base64')
  const petNames = doc.cases
    .map(c => (c.pet_name_en || c.pet_name || 'pet').replace(/[^\w가-힣]/g, '_'))
    .join('_')
  const partSuffix = partNumber > 0 ? `_part${partNumber}` : ''
  const filename = form.filename.replace('{pet_name}', `${petNames}${partSuffix}`)
  return { ok: true, pdf: base64, filename }
}

/** Shared font/appearance post-processing extracted so both single and multi paths use it. */
async function applyFontFixes(
  pdf: PDFDocument,
  pdfForm: import('pdf-lib').PDFForm,
  customFont: import('pdf-lib').PDFFont,
): Promise<void> {
  const fontName = 'NanumGothic'
  const fontRef = (customFont as unknown as { ref: import('pdf-lib').PDFRef }).ref
  const acroFormDict = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
  let dr = acroFormDict.lookup(PDFName.of('DR')) as PDFDict | undefined
  if (!(dr instanceof PDFDict)) {
    dr = pdf.context.obj({}) as PDFDict
    acroFormDict.set(PDFName.of('DR'), dr)
  }
  let drFonts = dr.lookup(PDFName.of('Font')) as PDFDict | undefined
  if (!(drFonts instanceof PDFDict)) {
    drFonts = pdf.context.obj({}) as PDFDict
    dr.set(PDFName.of('Font'), drFonts)
  }
  drFonts.set(PDFName.of(fontName), fontRef)

  for (const field of pdfForm.getFields()) {
    if (field.constructor.name !== 'PDFTextField') continue
    const tf = field as import('pdf-lib').PDFTextField
    const text = tf.getText() ?? ''
    const size = computeMaxFontSize(tf, text, customFont)
    const da = PDFString.of(`/${fontName} ${size} Tf 0 g`)
    field.acroField.dict.set(PDFName.of('DA'), da)
    for (const w of field.acroField.getWidgets()) {
      w.dict.set(PDFName.of('DA'), da)
    }
  }
  pdfForm.updateFieldAppearances(customFont)

  if (PDF_NEED_APPEARANCES === 'false') {
    acroFormDict.set(PDFName.of('NeedAppearances'), PDFBool.False)
  } else if (PDF_NEED_APPEARANCES === 'true') {
    // Let Acrobat regenerate APs using its own fonts so Korean typing works.
    acroFormDict.set(PDFName.of('NeedAppearances'), PDFBool.True)
  }
  // 'unset' → leave the key as-is from the template.
}

export type FillOptions = { includeSignature?: boolean; allowedVaccines?: string[] }

export async function fillPdf(formKey: string, caseRow: CaseRow, options?: FillOptions): Promise<FillResult> {
  const form = MAPS[formKey]
  if (!form) return { ok: false, error: `Unknown form: ${formKey}` }

  let templateBytes: Buffer
  try {
    templateBytes = await loadTemplate(form.template)
  } catch {
    return { ok: false, error: `템플릿을 찾을 수 없습니다: ${form.template}` }
  }

  const pdf = await PDFDocument.load(templateBytes)
  pdf.registerFontkit(fontkit)
  const fontBytes = await loadFontBytes()
  const customFont = await pdf.embedFont(fontBytes, { subset: PDF_SUBSET_FONT })

  const pdfForm = pdf.getForm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // Date reformatter for form-level dateFormat override (e.g. Annex III uses dd/mm/yyyy).
  // Converts a stand-alone YYYY-MM-DD or YYYY/MM/DD token to dd/mm/yyyy.
  const toDmy = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
  const toSlashYmd = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
  const MONTHS_SHORT_1 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const toDmmmY_1 = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${String(d).padStart(2, '0')}/${MONTHS_SHORT_1[Number(m) - 1] ?? m}/${y}`)
  const reformatDate = form.dateFormat === 'dmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? toDmy(s) : s)
    : form.dateFormat === 'ymd_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? toSlashYmd(s) : s)
    : form.dateFormat === 'dmmmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? toDmmmY_1(s) : s)
    : (s: unknown): unknown => s

  // Route single-case fills through the same multi-case resolver so
  // aggregate transforms (multi:species_en, multi:count, multi:microchip[n])
  // and row-based resolution stay consistent with fillPdfMulti.
  const soloDoc: PackedDoc = {
    cases: [caseRow],
    vaccSlots: [],
    animalSlots: [0],
    parasiteSlots: [0],
  }
  // Populate vacc slots so vacc_rowN_* fields still fill for single-animal docs.
  const doses = Math.max(1, rabiesDoseCount(caseRow))
  for (let d = 0; d < doses; d++) soloDoc.vaccSlots.push({ caseIdx: 0, doseIdx: d })

  const missing: string[] = []
  const empty: string[] = []
  const filled: Record<string, string | boolean> = {}
  for (const [fieldName, mapping] of Object.entries(form.fields)) {
    const value = reformatDate(resolveFieldMulti(fieldName, form.fields, soloDoc, options?.allowedVaccines))
    if (value === '' || value === false) empty.push(fieldName)
    else filled[fieldName] = typeof value === 'string' && value.length > 40 ? value.slice(0, 40) + '…' : value as string | boolean
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
      let text = typeof value === 'string' ? value : ''
      // Fall back to mapping.default when a transform returned empty.
      // Used for N/A placeholders on row/slot fields that shouldn't be blank.
      if (!text && mapping.default) text = mapping.default
      // Always setText (even to '') so any template default text is cleared.
      const tf = field as import('pdf-lib').PDFTextField
      tf.setText(text)
      if (mapping.align) {
        tf.setAlignment(
          mapping.align === 'center' ? TextAlignment.Center
          : mapping.align === 'right' ? TextAlignment.Right
          : TextAlignment.Left,
        )
      }
    }
  }

  await applyFontFixes(pdf, pdfForm, customFont)

  if (options?.includeSignature && form.signatures?.length) {
    const pages = pdf.getPages()
    for (const sig of form.signatures) {
      try {
        const imgBytes = await loadSignatureImage(sig.image)
        const img = sig.image.toLowerCase().endsWith('.jpg') || sig.image.toLowerCase().endsWith('.jpeg')
          ? await pdf.embedJpg(imgBytes)
          : await pdf.embedPng(imgBytes)
        const page = pages[sig.page ?? 0]
        if (!page) continue
        page.drawImage(img, { x: sig.x, y: sig.y, width: sig.w, height: sig.h })
      } catch (e) {
        console.warn(`[${formKey}] signature overlay failed:`, (e as Error).message)
      }
    }
  }

  // Static text overlays — unconditional (not gated by includeSignature).
  // Used for cells that are not form fields but must always carry a fixed
  // value (e.g. AU Babesia row always "N/A" for Korea-origin dogs).
  if (form.textOverlays?.length) {
    const pages = pdf.getPages()
    for (const t of form.textOverlays) {
      const page = pages[t.page ?? 0]
      if (!page) continue
      page.drawText(t.text, { x: t.x, y: t.y, size: t.size ?? 10, font: customFont })
    }
  }

  console.log(`\n[${formKey}] case=${caseRow.id}`)
  console.log(`  case.data keys:`, Object.keys(data))
  console.log(`  filled:`, filled)
  console.log(`  empty (no value resolved):`, empty)
  if (missing.length) console.warn(`  missing PDF fields:`, missing)

  const bytes = await pdf.save()
  const base64 = Buffer.from(bytes).toString('base64')
  const petName = (caseRow.pet_name_en || caseRow.pet_name || 'pet').replace(/[^\w가-힣]/g, '_')
  const filename = form.filename.replace('{pet_name}', petName)

  return { ok: true, pdf: base64, filename }
}
