/**
 * Shared PDF fill logic driven by data/pdf-field-mappings.json.
 * Reads case row, resolves each field value via the mapping's transform,
 * and fills the PDF form.
 */
import { PDFDocument, PDFName, PDFString, PDFDict, PDFBool, TextAlignment, PDFCheckBox, PDFDropdown, PDFTextField } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mappings from '@/data/pdf-field-mappings.json'
import { lookupRabies, lookupExternalParasite, lookupInternalParasite, lookupComprehensive, lookupCiv, lookupKennelCough, lookupParasiteById, getParasiteFamily } from '@petmove/domain'
import { VET_INFO } from '@/lib/vet-info'
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
const PDF_NEED_APPEARANCES: 'false' | 'true' | 'unset' = 'true'

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
  dateFormat?: 'dmy' | 'mdy_slash' | 'ymd_slash' | 'dmmmy'
  /**
   * true면 템플릿에 이미 기입된 텍스트 필드 값을 보존 — 매핑에 나열된
   * 필드만 새로 채우고 나머지는 템플릿 원본 appearance 그대로 유지.
   * Invoice처럼 pre-filled content가 많은 서식에 사용.
   */
  preserveTemplateText?: boolean
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

/**
 * 실험실 배송지 주소 — Invoice/ESD 의 Consignee 필드용.
 * inspection_lab 값으로 조회. 국내 실험실(APQA HQ 등)은 물리적 배송 없이 직접
 * 방문/전달하므로 Invoice 대상이 아님 — US 실험실만 정의.
 */
const LAB_SHIPPING: Record<string, { name: string; country: string; block: string }> = {
  ksvdl: {
    name: 'Kansas State Veterinary Diagnostic Laboratory',
    country: 'United States',
    block: [
      'Kansas State Veterinary Diagnostic Laboratory(KSVDL)',
      '1800 Denison Avenue, Mosier Hall D117',
      'Manhattan, KS, 66506, United States',
      'Tel. +1-866-512-5650 / emal: clientcare@vet.k-state.edu',
      'Tax ID#: 48-0771751',
    ].join('\n'),
  },
  vbddl: {
    name: 'Vector Borne Disease Diagnostic Lab',
    country: 'USA',
    block: [
      'Vector Borne Disease Diagnostic Lab',
      ' CVM Research Building, Room',
      ' 462A, 1060 William Moor Drive, Raleigh, NC 27606, USA',
      'Tel: +1 919-513-8279 / email: ncstatevectorborne@ncsu.edu',
      'Tax ID#: 56-6000756',
    ].join('\n'),
  },
  ksvdl_r: {
    name: 'Kansas State Rabies Laboratory',
    country: 'USA',
    block: [
      'Contact Name: Dr. Dale Claassen',
      'Tel. +1-785-532-4474 / emal: rabies@vet.k-state.edu',
      'Kansas State Rabies Laboratory, 2005 Research Park Circle',
      'Manhattan, KS, 66502, USA',
      'Tax ID#: 48-0771751',
    ].join('\n'),
  },
}

function formatLabShipping(code: string, attr: string): string {
  const lab = LAB_SHIPPING[code.toLowerCase()]
  if (!lab) return ''
  if (attr === 'name') return lab.name
  if (attr === 'country') return lab.country
  if (attr === 'block' || attr === 'full') return lab.block
  if (attr === 'name_line') return lab.block.split('\n').join(', ')
  // line1/line2/city_state_zip/phone: 매핑에서 사용 안 함 — 호환성 위해 '' 반환.
  return ''
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

/** sex code → 한글 축약. 검역본부 혈청검사 신청서 등 한국 서식용. */
const SEX_LABEL_KO: Record<string, string> = {
  male: '수',
  female: '암',
  neutered_male: '중성화수',
  spayed_female: '중성화암',
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

/** 호주·뉴질랜드 목적지 여부 — Form25 batch 란에 유효기간 병기 조건. */
function destinationIsAuNz(dest: unknown): boolean {
  if (typeof dest !== 'string' || !dest) return false
  return dest.split(',').map(s => s.trim()).some(d => d === '호주' || d === '뉴질랜드')
}

/** batch + expiry 병기 포맷 ("batch / expiry"). expiry 없으면 batch만. */
function joinBatchExpiry(batch: string, expiry: string): string {
  if (!expiry) return batch
  if (!batch) return expiry
  return `${batch} / ${expiry}`
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

/**
 * 임베드 폰트(NanumGothic)에 없는 확장 라틴 글리프(예: ō, é, ñ, ü)를
 * 분해 기반(NFD)으로 기본 글자 + combining mark 로 나눈 뒤 mark를 제거해 폰트가
 * 렌더 가능한 문자로 낮춤. 한글·숫자·기본 라틴·기본 구두점은 영향 없음.
 *
 * 예: "Izumiōtsu" → "Izumiotsu", "São Paulo" → "Sao Paulo".
 * 일본 한자·중국 한자·히라가나·가타카나 등 NFD로 해결 안 되는 글리프는 그대로 둠.
 */
function sanitizeForFont(text: string): string {
  if (!text) return text
  // NFD: 결합형 문자를 기본 글자 + combining mark 로 분해
  // replace: combining mark 영역(U+0300–U+036F) 만 제거 — 한글 자모·한자 등은 영향 없음
  // NFC: 한글 자모 분해된 형태(ㄱ+ㅏ+ㅇ)를 다시 precomposed 글자(강)로 재결합.
  //      이 단계가 없으면 한글이 자모 단위로 PDF에 들어가 폰트가 glyph를 못 찾음.
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
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
  /** Per-record user overrides (from repeatable-date-field.tsx).
   * When present, take precedence over catalog lookup values so PDFs
   * reflect what the user actually typed in the detail page. */
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
  /** Immunity validity end — displayed as-is. Free text, e.g. '2029-04-20' or '3년'. */
  valid_until?: string | null
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

/** Same as sortedDescRecords but ascending — oldest first. */
function sortedAscRecords(arr: unknown): ParasiteRecord[] {
  return sortedDescRecords(arr).slice().reverse()
}

/**
 * Resolve "Valid until" (validity_to) from vaccination date + rec.valid_until.
 *
 * - `rec.valid_until = '3년' | '3 yrs' | '3y'` → vaccination date + 3 years → 'YYYY/MM/DD'
 * - `rec.valid_until` empty/null → vaccination date + fallbackYears (default 1)
 * - `rec.valid_until` is a literal date like '2029-04-15' → returned as '2029/04/15'
 *
 * Returns '' when the vaccination date is malformed.
 */
function resolveValidityTo(
  rec: ParasiteRecord | null | undefined,
  date: string,
  fallbackYears = 1,
): string {
  const raw = rec?.valid_until?.trim()
  const yearsMatch = raw?.match(/^(\d+)\s*(?:년|yrs?|years?|y)$/i)
  if (raw && !yearsMatch) return fmtDate(raw)
  const years = yearsMatch ? Number(yearsMatch[1]) : fallbackYears
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${Number(m[1]) + years}/${m[2]}/${m[3]}`
}

/**
 * Parse rec.valid_until as a year count. Defaults to 1 when empty or unparseable.
 * Used by the form25 N-year validity checkboxes.
 */
function parseValidYears(rec: ParasiteRecord | null | undefined): number {
  const raw = rec?.valid_until?.trim()
  const yearsMatch = raw?.match(/^(\d+)\s*(?:년|yrs?|years?|y)$/i)
  return yearsMatch ? Number(yearsMatch[1]) : 1
}

/**
 * Merge per-record user overrides (product/manufacturer/lot/expiry from the detail
 * page) on top of catalog lookup values. User input wins when non-empty.
 */
function applyRecOverrides(
  rec: Pick<ParasiteRecord, 'product' | 'manufacturer' | 'lot' | 'expiry'> | null | undefined,
  p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null; expiry?: string | null } | null,
): { name: string; manufacturer: string; serial: string; expiry: string } {
  const name = rec?.product?.trim() || p?.vaccine || p?.product || ''
  const manufacturer = rec?.manufacturer?.trim() || p?.manufacturer || ''
  const serial = rec?.lot?.trim() || p?.batch || ''
  const expiryRaw = rec?.expiry?.trim() || p?.expiry || ''
  return { name, manufacturer, serial, expiry: fmtDate(expiryRaw) }
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
  const gvRec = (!allowedVaccines || allowedVaccines.includes('general')) ? sortedDescRecords(data.general_vaccine_dates)[0] : undefined
  if (gvRec) {
    const p = hasSpecies ? lookupComprehensive(species as 'dog' | 'cat', gvRec.date) : null
    out.push({ type: 'Vaccination', ...applyRecOverrides(gvRec, p), date: fmtDate(gvRec.date) })
  }

  // 2/3. Parasiticides — pick latest of each side, dedupe combo across sides.
  const buildParasite = (rec: ParasiteRecord, side: 'external' | 'internal'): OtherVacEntry => {
    if (rec.product_id) {
      const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
      return { type: 'Parasiticide', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) }
    }
    const p = hasSpecies
      ? (side === 'external'
          ? lookupExternalParasite(species as 'dog' | 'cat', rec.date, weightKg)
          : lookupInternalParasite(species as 'dog' | 'cat', rec.date, weightKg))
      : null
    return { type: 'Parasiticide', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) }
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
    out.push({ type: 'Vaccination', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
  }

  // 2. CIV (Vaccination)
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('civ')) ? latestAscending(data.civ_dates) : [])) {
    const p = lookupCiv(rec.date)
    out.push({ type: 'Vaccination', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
  }

  // 3. 켄넬코프 (Vaccination)
  for (const rec of ((!allowedVaccines || allowedVaccines.includes('kennel')) ? latestAscending(data.kennel_cough_dates) : [])) {
    const p = lookupKennelCough()
    out.push({ type: 'Vaccination', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
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
      out.push({ type: 'Parasiticide', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
      return
    }
    const p = hasSpecies
      ? (side === 'external'
          ? lookupExternalParasite(species as 'dog' | 'cat', rec.date, weightKg)
          : lookupInternalParasite(species as 'dog' | 'cat', rec.date, weightKg))
      : null
    out.push({ type: 'Parasiticide', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
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

  // Lab-specific inspection date from infectious_disease_records.
  // Pattern: `infectious_date:<lab>` (e.g. ksvdl, vbddl, apqa_hq).
  // Falls back to vet_visit_date when no record exists for that lab.
  const infDateMatch = source.match(/^infectious_date:(.+)$/)
  if (infDateMatch) {
    const lab = infDateMatch[1]
    const recs = data.infectious_disease_records
    if (Array.isArray(recs)) {
      const rec = (recs as Array<{ lab?: string; date?: string | null }>).find(r => r.lab === lab)
      if (rec?.date) return rec.date
    }
    return data.vet_visit_date ?? ''
  }

  // Direct `address_city`: legacy saves sometimes captured "Republic of Korea"
  // as city because roadAddressEnglish included the country. Re-derive from
  // address_en when we detect that bad value.
  if (source === 'address_city') {
    const stored = String(data.address_city ?? '').trim()
    if (stored && !/^republic of korea$/i.test(stored)) return stored
    const addrEn = String(data.address_en ?? '')
    const parts = addrEn.split(',').map(s => s.trim()).filter(Boolean)
    const cleaned = parts.length > 0 && /^republic of korea$/i.test(parts[parts.length - 1])
      ? parts.slice(0, -1) : parts
    const last = cleaned[cleaned.length - 1] ?? ''
    const secondLast = cleaned[cleaned.length - 2] ?? ''
    return /-do$/i.test(last) && secondLast ? secondLast : last
  }

  // Composite "Post code / Place" — "<zipcode> <city>" for EU forms that combine
  // both into one field. Falls back gracefully when either part is missing.
  // Legacy: if zipcode isn't stored but address has "(XXXXX) " prefix, extract it.
  if (source === 'postcode_place') {
    let zip = String(data.address_zipcode ?? '').trim()
    if (!zip) {
      const krAddr = String(data.address_kr ?? '')
      const m = krAddr.match(/^\((\d{4,6})\)/)
      if (m) zip = m[1]
    }
    let city = String(data.address_city ?? '').trim()
    // Defensive: older saves sometimes captured "Republic of Korea" as city
    // because roadAddressEnglish included the country at the end. Skip it.
    if (/^republic of korea$/i.test(city)) {
      const addrEn = String(data.address_en ?? '')
      const parts = addrEn.split(',').map(s => s.trim()).filter(Boolean)
      const cleaned = parts.length > 0 && /^republic of korea$/i.test(parts[parts.length - 1])
        ? parts.slice(0, -1) : parts
      const last = cleaned[cleaned.length - 1] ?? ''
      const secondLast = cleaned[cleaned.length - 2] ?? ''
      city = /-do$/i.test(last) && secondLast ? secondLast : last
    }
    return [zip, city].filter(Boolean).join(' ')
  }

  // Composite `address_en_no_country` — address_en with trailing "Republic of
  // Korea" stripped, for forms where the country is labeled separately (e.g.
  // CH §1 Address + static "Country: Republic of Korea" label).
  if (source === 'address_en_no_country') {
    const s = String(data.address_en ?? '').trim()
    if (!s) return ''
    const parts = s.split(',').map(seg => seg.trim()).filter(Boolean)
    const cleaned = parts.length > 0 && /^republic of korea$/i.test(parts[parts.length - 1])
      ? parts.slice(0, -1) : parts
    return cleaned.join(', ')
  }

  // address_overseas: 국가별로 저장 위치가 top-level(data.address_overseas) vs
  // 나라별 extra 객체(data.{japan,hawaii,philippines,thailand}_extra.address_overseas) 로
  // 갈라져 있어, 두 경로 모두 확인하는 fallback.
  if (source === 'address_overseas') {
    const top = (data.address_overseas as string | null | undefined)
    if (top != null && top !== '') return top
    const nestedKeys = ['japan_extra', 'hawaii_extra', 'philippines_extra', 'thailand_extra']
    for (const key of nestedKeys) {
      const nested = data[key] as { address_overseas?: string | null } | undefined
      const val = nested?.address_overseas
      if (val != null && val !== '') return val
    }
    return ''
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
  // Empty-array checkbox — true when source value is null/undefined/empty array.
  // e.g. `checkbox:empty_array` with source `general_vaccine_dates` ticks when
  // the dog has no recorded general vaccine (used by Leptospira canicola on KSVDL).
  if (transform === 'checkbox:empty_array') {
    if (raw == null) return true
    if (Array.isArray(raw)) return raw.length === 0
    return String(raw) === ''
  }

  // Dropdown sex/neutered — maps DB sex code to dropdown option values
  if (transform === 'dropdown_sex') {
    const s = String(raw ?? '')
    if (s === 'male' || s === 'neutered_male') return 'MALE'
    if (s === 'female' || s === 'spayed_female') return 'FEMALE'
    return ''
  }
  if (transform === 'dropdown_neutered') {
    const s = String(raw ?? '')
    if (s === 'neutered_male' || s === 'spayed_female') return 'NEUTERED'
    if (s === 'male' || s === 'female') return 'ENTIRE'
    return ''
  }

  // Split name into first/middle/last parts
  const splitMatch = transform?.match(/^split_name:(first|middle|last)$/)
  if (splitMatch) {
    const part = splitMatch[1]
    const s = String(raw ?? '').trim()
    const parts = s.split(/\s+/).filter(Boolean)
    if (part === 'first') return parts[0] ?? ''
    if (part === 'middle') return parts.length > 2 ? parts[1][0] : ''
    if (part === 'last') return parts.length > 1 ? parts[parts.length - 1] : ''
    return ''
  }

  // Conditional rabies date — only fill if primary (1 dose) or booster (2+ doses)
  // vaccine_desc:rabies:primary_date[N] — returns date[N] only when total doses == 1
  // vaccine_desc:rabies:booster_date[N] — returns date[N] only when total doses >= 2
  const rabiesCondMatch = transform?.match(/^vaccine_desc:rabies:(primary|booster)_date\[(\d+)\]$/)
  if (rabiesCondMatch) {
    const mode = rabiesCondMatch[1] // 'primary' or 'booster'
    const idx = Number(rabiesCondMatch[2])
    const allDates = sortedDesc(raw)
    const isPrimary = allDates.length <= 1
    if ((mode === 'primary') !== isPrimary) return ''
    const date = allDates[idx]
    return date ? fmtDate(date) : ''
  }

  // Strip trailing country name from address (e.g. ", Republic of Korea" / ", South Korea" / ", Korea")
  if (transform === 'strip_country') {
    return String(raw ?? '').replace(/,?\s*(Republic of Korea|South Korea|Korea)\s*\.?\s*$/i, '').trim()
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

  // Last N digits of the raw string (spaces/dashes stripped).
  if (transform === 'last_4_digits') {
    const s = String(raw ?? '').replace(/\D/g, '')
    return s.length >= 4 ? s.slice(-4) : s
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

  // Korean address parser — splits an English-romanized Korean address into
  // No / Street / City / State / Country components for forms that split
  // the destination/origin address into discrete fields (e.g. Thailand R.11).
  //
  // Handles two common Daum Postcode output shapes:
  //   (A) "25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea"
  //       → no="25", street="Irwon-ro 14-gil", city="Gangnam-gu", state="Seoul"
  //   (B) "12-37, Sinhyeon-ro, Gwangju-si, Gyeonggi-do, Republic of Korea"
  //       → no="12-37", street="Sinhyeon-ro", city="Gwangju-si", state="Gyeonggi-do"
  //
  // Algorithm:
  //   1. Strip trailing "Republic of Korea" (keep country separately).
  //   2. Remaining: [street_parts..., city, state?]. Last segment = state (if
  //      it ends with "-do" or is a special city like Seoul/Busan/...), else
  //      treat the last as city with state empty.
  //   3. Second-to-last (after state removal) = city (gu/si).
  //   4. Leftover segments form No + Street. If exactly 1 leftover segment,
  //      split by first whitespace into No + Street (handles "25 Irwon-ro …").
  //      If 2+ segments, first = No, rest joined = Street.
  const krAddrMatch = transform?.match(/^kr_addr:(no|street|city|state|country|postcode)$/)
  if (krAddrMatch) {
    const attr = krAddrMatch[1]
    if (attr === 'country') return 'Republic of Korea'
    if (attr === 'postcode') {
      return String(data.address_zipcode ?? '').trim()
    }
    const s = String(raw ?? '').trim()
    if (!s) return ''
    const all = s.split(',').map(seg => seg.trim()).filter(Boolean)
    const parts = all.length && /^republic of korea$/i.test(all[all.length - 1]) ? all.slice(0, -1) : all
    if (parts.length === 0) return ''
    // Detect province/state: "-do" suffix or special-city names act as state.
    const SPECIAL_CITIES = /^(seoul|busan|incheon|daegu|daejeon|gwangju|ulsan|sejong)$/i
    const last = parts[parts.length - 1]
    const hasState = /-do$/i.test(last) || SPECIAL_CITIES.test(last)
    const state = hasState ? last : ''
    const afterState = hasState ? parts.slice(0, -1) : parts
    const city = afterState.length >= 2 ? afterState[afterState.length - 1] : (afterState[afterState.length - 1] ?? '')
    const streetParts = afterState.length >= 2 ? afterState.slice(0, -1) : []
    // Split No + Street. Two segment patterns need different handling:
    //   "12-37, Sinhyeon-ro"  → first segment is pure digits(+hyphen) = No
    //   "98 Pangyoyeok-ro, Bundang-gu" → first is "number + road", split by whitespace
    let no = '', street = ''
    const numOnly = /^\d+(-\d+)?$/
    if (streetParts.length === 1) {
      const m = streetParts[0].match(/^(\S+)\s+(.+)$/)
      if (m) { no = m[1]; street = m[2] }
      else { street = streetParts[0] }
    } else if (streetParts.length >= 2) {
      if (numOnly.test(streetParts[0])) {
        no = streetParts[0]
        street = streetParts.slice(1).join(', ')
      } else {
        const m = streetParts[0].match(/^(\S+)\s+(.+)$/)
        if (m) {
          no = m[1]
          street = [m[2], ...streetParts.slice(1)].join(', ')
        } else {
          street = streetParts.join(', ')
        }
      }
    }
    if (attr === 'no') return no
    if (attr === 'street') return street
    if (attr === 'city') return city
    if (attr === 'state') return state
    return ''
  }

  // Swiss address parser — splits a free-form "Street, PLZ City, Switzerland"
  // string into street / PLZ City / country components. PLZ is always 4 digits.
  // Heuristic: find the segment starting with 4 digits → that's "PLZ City".
  // Everything before = street, everything after = country (ignored, we always
  // render "Switzerland" as the country).
  //
  // Examples that parse correctly:
  //   "Rue du Lac 12, 1800 Vevey, Switzerland"
  //     → street="Rue du Lac 12", postcode="1800", city="Vevey"
  //   "Bahnhofstrasse 10, 8001 Zürich"
  //     → street="Bahnhofstrasse 10", postcode="8001", city="Zürich"
  //   "Route de Meyrin 15, 1202 Genève"
  //     → street="Route de Meyrin 15", postcode="1202", city="Genève"
  // When parsing fails (no PLZ found), fall back to street=entire input,
  // postcode/city="".
  const swissAddrMatch = transform?.match(/^swiss_addr:(street|postcode_place|postcode|city)$/)
  if (swissAddrMatch) {
    const attr = swissAddrMatch[1]
    const s = String(raw ?? '').trim()
    if (!s) return ''
    const segments = s.split(',').map(seg => seg.trim()).filter(Boolean)
    const plzIdx = segments.findIndex(seg => /^\d{4}(\s|$)/.test(seg))
    if (plzIdx < 0) {
      if (attr === 'street') return s
      return ''
    }
    const plzSeg = segments[plzIdx]
    const m = plzSeg.match(/^(\d{4})\s*(.*)$/)
    const postcode = m?.[1] ?? ''
    const city = (m?.[2] ?? '').trim()
    const street = segments.slice(0, plzIdx).join(', ')
    if (attr === 'street') return street
    if (attr === 'postcode') return postcode
    if (attr === 'city') return city
    if (attr === 'postcode_place') return [postcode, city].filter(Boolean).join(' ')
    return ''
  }

  // Checkbox from JSON object field equality. `json_eq:<key>:<value>`.
  const jsonEqMatch = transform?.match(/^json_eq:([^:]+):(.+)$/)
  if (jsonEqMatch) {
    if (!raw || typeof raw !== 'object') return false
    const v = (raw as Record<string, unknown>)[jsonEqMatch[1]]
    return String(v ?? '') === jsonEqMatch[2]
  }

  // Checkbox from JSON object field membership. `json_in:<key>:<v1>|<v2>|...`.
  const jsonInMatch = transform?.match(/^json_in:([^:]+):(.+)$/)
  if (jsonInMatch) {
    if (!raw || typeof raw !== 'object') return false
    const v = (raw as Record<string, unknown>)[jsonInMatch[1]]
    return jsonInMatch[2].split('|').includes(String(v ?? ''))
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

  // Today's day of month (1-31, no padding) — legacy, kept for upstream Form_R11 compat.
  if (transform === 'today_day') {
    return String(new Date().getDate())
  }
  if (transform === 'today_month') {
    return String(new Date().getMonth() + 1)
  }
  // Today's year in Buddhist Era (Gregorian + 543).
  if (transform === 'today_be_year') {
    return String(new Date().getFullYear() + 543)
  }

  // Part of today's date. `today_part:(day|month|year|be_year)`.
  // `be_year` = Gregorian + 543 (Thai Buddhist Era).
  const todayPartMatch = transform?.match(/^today_part:(day|month|year|be_year)$/)
  if (todayPartMatch) {
    const d = new Date()
    const part = todayPartMatch[1]
    if (part === 'day') return String(d.getDate()).padStart(2, '0')
    if (part === 'month') return String(d.getMonth() + 1).padStart(2, '0')
    if (part === 'year') return String(d.getFullYear())
    if (part === 'be_year') return String(d.getFullYear() + 543)
    return ''
  }

  // Part of a YYYY-MM-DD source value. `date_part:(day|month|year)`.
  // 예: source="vet_visit_date" + transform="date_part:year" → "2026"
  // raw 값이 비었거나 형식이 맞지 않으면 빈 문자열 반환.
  const datePartMatch = transform?.match(/^date_part:(day|month|year)$/)
  if (datePartMatch) {
    const s = typeof raw === 'string' ? raw : ''
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return ''
    const part = datePartMatch[1]
    if (part === 'year') return m[1]
    if (part === 'month') return m[2]
    if (part === 'day') return m[3]
    return ''
  }

  // Conditional static label — `label_if:<kind>:<label>`. Returns <label> only
  // when the matching `*_dates` array in `data` has entries, else empty.
  // Used by VHC's 6-row vaccination table so "Rabies"/"CIV"/etc. only appears
  // for rows that actually have data.
  //
  // Species split: if <label> contains `|`, the part before = dog label, after
  // = cat label. E.g. `label_if:general:DHPPL|FVRCP` prints the species-
  // appropriate shorthand for the comprehensive vaccine.
  const labelIfMatch = transform?.match(/^label_if:([a-z_]+):(.+)$/)
  if (labelIfMatch) {
    const KIND_TO_DATES: Record<string, string> = {
      rabies: 'rabies_dates',
      general: 'general_vaccine_dates',
      comprehensive: 'general_vaccine_dates',
      civ: 'civ_dates',
      kennel: 'kennel_cough_dates',
      heartworm: 'heartworm_dates',
      ext_parasite: 'external_parasite_dates',
      int_parasite: 'internal_parasite_dates',
    }
    const key = KIND_TO_DATES[labelIfMatch[1]]
    if (!key) return ''
    const v = data[key]
    if (!Array.isArray(v) || v.length === 0) return ''
    const labelStr = labelIfMatch[2]
    const pipeIdx = labelStr.indexOf('|')
    if (pipeIdx >= 0) {
      const dogLabel = labelStr.slice(0, pipeIdx)
      const catLabel = labelStr.slice(pipeIdx + 1)
      const species = String(data.species ?? '').toLowerCase()
      return species === 'cat' ? catLabel : dogLabel
    }
    return labelStr
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

  // Boolean: does the nth vaccine record's 유효기간(valid_until) equal the given year?
  // Drives form25-style 1Y/2Y/3Y rabies validity checkboxes.
  // `validity_y_eq:1[0]` → true when record[0] exists AND valid_until is null/"1년".
  // Empty or non-"N년" valid_until counts as 1년 (matches UI default).
  const validityYearMatch = transform?.match(/^validity_y_eq:(\d+)\[(\d+)\]$/)
  if (validityYearMatch) {
    const targetYears = Number(validityYearMatch[1])
    const idx = Number(validityYearMatch[2])
    const rec = sortedAscRecords(raw)[idx]
    if (!rec) return false
    return parseValidYears(rec) === targetYears
  }

  // Form25 "기타 예방접종" slot filler. `other_vacc_seq:<attr>[<n>]`.
  // Pulls the nth entry of the compressed vaccine sequence built from
  // comprehensive → external → internal (skipping missing types).
  const seqMatch = transform?.match(/^other_vacc_seq:(type|name|manufacturer|serial|date)\[(\d+)\]$/)
  if (seqMatch) {
    const attr = seqMatch[1] as keyof OtherVacEntry
    const idx = Number(seqMatch[2])
    const entry = buildOtherVaccineSequence(data, allowedVaccines)[idx]
    if (!entry) return ''
    // AU/NZ: batch 란에 유효기간 병기
    if (attr === 'serial' && destinationIsAuNz(caseRow.destination)) {
      return joinBatchExpiry(entry.serial, entry.expiry)
    }
    return entry[attr]
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
      if (rec.product?.trim()) return rec.product.trim()
      const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
      const species = String(data.species ?? '').toLowerCase()
      if (rec.product_id) {
        const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
        return p?.product ?? ''
      }
      if (species === 'dog' || species === 'cat') {
        const p = lookupInternalParasite(species, rec.date, weightKg)
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
    const rec = sortedDescRecords(raw)[idx]
    const date = rec?.date
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    if ((kind === 'civ' || kind === 'comprehensive') && attr === 'validity_from') return fmtDate(date)
    // validity_to: rec.valid_until (예: "3년") 우선, 없으면 접종일 + 1년 기본.
    // rabies/civ/comprehensive는 기본 1년. 다른 kind는 아래 catalog fallback 사용.
    if ((kind === 'civ' || kind === 'comprehensive' || kind === 'rabies') && attr === 'validity_to') {
      return resolveValidityTo(rec, date, 1)
    }
    const species = String(data.species ?? '').toLowerCase()
    const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
    let p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null; expiry?: string | null; validityFrom?: string; validityTo?: string } | null = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'civ') p = lookupCiv(date)
    else if (kind === 'comprehensive' && (species === 'dog' || species === 'cat')) p = lookupComprehensive(species, date)
    else if (kind === 'ext_parasite' && (species === 'dog' || species === 'cat')) p = lookupExternalParasite(species, date, weightKg)
    else if (kind === 'int_parasite' && (species === 'dog' || species === 'cat')) p = lookupInternalParasite(species, date, weightKg)
    const merged = applyRecOverrides(rec, p)
    if (attr === 'name') return merged.name
    if (attr === 'manufacturer') return merged.manufacturer
    if (attr === 'serial') return merged.serial
    if (attr === 'validity_from') return fmtDate(p?.validityFrom ?? '')
    if (attr === 'validity_to') return fmtDate(p?.validityTo ?? '')
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
    const recs = sortedAscRecords(raw)
    if (recs.length === 0) return ''
    if (attr === 'booster_due') {
      const latest = recs[recs.length - 1].date
      const m = latest.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return ''
      return fmtDate(`${Number(m[1]) + 1}-${m[2]}-${m[3]}`)
    }
    const values = recs.map(rec => {
      const p = lookupRabies(rec.date) as (ReturnType<typeof lookupRabies> & { expiry?: string }) | null
      const merged = applyRecOverrides(rec, p)
      if (attr === 'name') return merged.name
      if (attr === 'serial') return merged.serial
      if (attr === 'product_expiry') return merged.expiry
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
    const rec = sortedAscRecords(raw)[idx]
    const date = rec?.date
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    // validity_to: rec.valid_until (예: "3년") 우선 적용. rabies는 기본 1년.
    if (kind === 'rabies' && attr === 'validity_to') {
      return resolveValidityTo(rec, date, 1)
    }
    const species = String(data.species ?? '').toLowerCase()
    const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
    let p: { vaccine?: string; product?: string; manufacturer?: string; batch?: string | null; expiry?: string | null; validityFrom?: string; validityTo?: string } | null = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'ext_parasite' && (species === 'dog' || species === 'cat')) p = lookupExternalParasite(species, date, weightKg)
    else if (kind === 'int_parasite' && (species === 'dog' || species === 'cat')) p = lookupInternalParasite(species, date, weightKg)
    const merged = applyRecOverrides(rec, p)
    if (attr === 'name') return merged.name
    if (attr === 'manufacturer') return merged.manufacturer
    if (attr === 'serial') {
      // AU/NZ: batch 란에 유효기간 병기
      if (destinationIsAuNz(caseRow.destination)) {
        return joinBatchExpiry(merged.serial, merged.expiry ?? '')
      }
      return merged.serial
    }
    if (attr === 'serial_with_expiry') {
      return joinBatchExpiry(merged.serial, merged.expiry ?? '')
    }
    if (attr === 'validity_from') return fmtDate(p?.validityFrom ?? '')
    if (attr === 'validity_to') return fmtDate(p?.validityTo ?? '')
    return ''
  }

  // Text transforms
  if (transform === 'en' && source === 'species') {
    return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  }

  if (transform === 'sex_label') {
    return SEX_LABEL_EN[String(raw ?? '').toLowerCase()] ?? ''
  }
  if (transform === 'sex_label_ko') {
    return SEX_LABEL_KO[String(raw ?? '').toLowerCase()] ?? ''
  }
  // "Male" / "Female" / "Neutered male" / "Spayed female" — readable English label
  // for lab/dropdown forms. Preserves neuter status; title case, space (no underscore).
  if (transform === 'sex_simple_en' || transform === 'sex_simple') {
    const s = String(raw ?? '').toLowerCase()
    if (s === 'male') return 'Male'
    if (s === 'female') return 'Female'
    if (s === 'neutered_male') return 'Neutered male'
    if (s === 'spayed_female') return 'Spayed female'
    return ''
  }
  // "Neutered" / "Entire" — used by NZ certificate dropdowns.
  if (transform === 'sex_neutered_status') {
    const s = String(raw ?? '').toLowerCase()
    if (s === 'neutered_male' || s === 'spayed_female') return 'Neutered'
    if (s === 'male' || s === 'female') return 'Entire'
    return ''
  }

  // MM/DD/YYYY with no separators (US lab forms: KSVDL "Date Blood Drawn (mmddyyyy)").
  if (transform === 'date_mdy_compact') {
    const s = String(raw ?? '')
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return ''
    return `${m[2]}${m[3]}${m[1]}`
  }

  // Korean age label — birth_date 기준 "N살" (만 나이). 검역본부 서식의 '연령' 칸용.
  if (transform === 'age_ko') {
    const a = ageParts(raw)
    if (!a) return ''
    return a.years === 0 ? `${a.months}개월` : `${a.years}살`
  }

  // Vet info central lookup. `vet:<key>` — returns VET_INFO[key] as string.
  // Special: `vet:invoice_shipper_block` returns a multi-line block formatted
  // for the FedEx Commercial Invoice "SHIPPER/EXPORTER" cell.
  const vetMatch = transform?.match(/^vet:(.+)$/)
  if (vetMatch) {
    const key = vetMatch[1]
    if (key === 'invoice_shipper_block') {
      const v = VET_INFO
      return [
        v.clinic_en,
        v.address_en,
        `Tel: ${v.phone_intl}`,
        `Email: ${v.email}`,
        `Veterinarian: ${v.name_en} (License No. ${v.license_no})`,
      ].join('\n')
    }
    const v = (VET_INFO as Record<string, unknown>)[key]
    return v == null ? '' : String(v)
  }

  // Lab shipping address lookup (Invoice/ESD consignee).
  // `lab_shipping:<attr>` where attr is name/line1/line2/city_state_zip/country/
  // phone/full/name_line/block. Reads the lab code from raw (source =
  // "consignee_lab" which is passed in via extras).
  const labShipMatch = transform?.match(/^lab_shipping:(name|line1|line2|city_state_zip|country|phone|full|name_line|block)$/)
  if (labShipMatch) {
    const code = String(raw ?? '').toLowerCase()
    const attr = labShipMatch[1]
    if (attr === 'name_line') {
      // ESD 한 줄 표기: "name, line1, city state zip, country"
      const full = formatLabShipping(code, 'full')
      return full.split('\n').filter(s => !s.startsWith('Tel ')).join(', ')
    }
    if (attr === 'block') {
      // Invoice multi-line Consignee 블록
      return formatLabShipping(code, 'full')
    }
    return formatLabShipping(code, attr)
  }

  // Invoice specimen description — "Non-infectious canine serum (0.5 mL × N tubes)"
  // where N comes from the numeric source (tube_count).
  if (transform === 'invoice_specimen_desc') {
    const n = Number(raw)
    const count = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1
    return `Non-infectious canine serum (0.5 mL × ${count} ${count === 1 ? 'tube' : 'tubes'})`
  }

  // Invoice total value — tube_count × 1.00 USD, formatted "N.00".
  if (transform === 'invoice_total_value') {
    const n = Number(raw)
    const count = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1
    return `${count}.00`
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
    // Generic array of objects with .date / .value etc. (infectious_disease_records, etc.)
    if (Array.isArray(raw) && prop) {
      const rec = raw[idx] as Record<string, unknown> | undefined
      if (!rec) return ''
      const v = rec[prop]
      if (prop === 'date' && typeof v === 'string') return fmtDate(v)
      return v == null ? '' : String(v)
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
    if (!date) return ''
    const rec = sortedAscRecords(raw).find(r => r.date === date) ?? null
    const p = lookupRabies(date)
    const merged = applyRecOverrides(rec, p)
    if (!merged.name && !merged.manufacturer) return ''
    return merged.name ? (merged.manufacturer ? `${merged.name} (${merged.manufacturer})` : merged.name) : merged.manufacturer
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
    const rec = sortedDescRecords(raw)[idx]
    if (!rec?.date) return ''
    const p = lookupRabies(rec.date)
    const merged = applyRecOverrides(rec, p)
    if (!merged.name && !merged.manufacturer) return ''
    return merged.name ? (merged.manufacturer ? `${merged.name} (${merged.manufacturer})` : merged.name) : merged.manufacturer
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
  const toMdy = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`)
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
    : form.dateFormat === 'mdy_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toMdy)(s) : s)
    : form.dateFormat === 'ymd_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toSlashYmd2)(s) : s)
    : form.dateFormat === 'dmmmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? eachPart(toDmmmY)(s) : s)
    : (s: unknown): unknown => s

  for (const [fieldName, mapping] of Object.entries(form.fields)) {
    const value = reformatDate(resolveFieldMulti(fieldName, form.fields, doc))
    let field
    try { field = pdfForm.getField(fieldName) } catch { continue }
    if (field instanceof PDFCheckBox) {
      if (value === true) field.check()
      else field.uncheck()
    } else if (field instanceof PDFDropdown) {
      if (typeof value === 'string' && value) {
        try { field.select(value) } catch { /* option not found */ }
      }
    } else if (field instanceof PDFTextField) {
      let text = typeof value === 'string' ? value : ''
      // Fall back to mapping.default when a transform returned empty.
      // This lets us set `"default": "N/A"` on row/slot fields that should
      // show "N/A" whenever the underlying data is missing (e.g. optional
      // test rows, skipped vaccine doses).
      if (!text && mapping.default) text = mapping.default
      text = sanitizeForFont(text)
      // Always setText (even to '') so any template default text is cleared.
      field.setText(text)
      if (mapping.align) {
        field.setAlignment(
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
      page.drawText(sanitizeForFont(t.text), { x: t.x, y: t.y, size: t.size ?? 10, font: customFont })
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

/** Shared font/appearance post-processing extracted so both single and multi paths use it.
 *  `touchedFieldNames` limits DA/appearance regeneration to the listed fields — used by
 *  Invoice where template carries pre-filled content that must keep its original look. */
async function applyFontFixes(
  pdf: PDFDocument,
  pdfForm: import('pdf-lib').PDFForm,
  customFont: import('pdf-lib').PDFFont,
  touchedFieldNames?: Set<string>,
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
    if (!(field instanceof PDFTextField)) continue
    if (touchedFieldNames && !touchedFieldNames.has(field.getName())) continue
    const tf = field
    const text = tf.getText() ?? ''
    // preserveTemplateText 모드: 템플릿 DA에 명시된 폰트 크기(>0)를 상한으로 사용
    // — 셀이 커서 autosize가 과도하게 확대되는 문제 방지. 단, 줄바꿈이 포함된
    // 멀티라인 텍스트는 실제 줄 수에 맞춰 더 줄여야 마지막 줄이 잘리지 않음
    // (예: Invoice Consignee 블록 5줄이 66pt 셀에 담기려면 ~9pt 필요).
    let size: number | null = null
    if (touchedFieldNames) {
      const existingDa = field.acroField.dict.get(PDFName.of('DA'))
      const daStr = existingDa instanceof PDFString ? existingDa.asString() : ''
      const m = daStr.match(/\s(\d+(?:\.\d+)?)\s+Tf/)
      const daSize = m ? parseFloat(m[1]) : 0
      if (daSize > 0) {
        size = daSize
        if (tf.isMultiline() && text.includes('\n')) {
          const lines = text.split('\n').length
          const h = tf.acroField.getWidgets()[0]?.getRectangle().height ?? 0
          if (lines > 1 && h > 0) {
            const fit = Math.max(5, Math.floor(((h - 4) / lines / 1.3) * 2) / 2)
            size = Math.min(daSize, fit)
          }
        }
      }
    }
    if (size === null) size = computeMaxFontSize(tf, text, customFont)
    const da = PDFString.of(`/${fontName} ${size} Tf 0 g`)
    field.acroField.dict.set(PDFName.of('DA'), da)
    for (const w of field.acroField.getWidgets()) {
      w.dict.set(PDFName.of('DA'), da)
    }
  }
  if (touchedFieldNames) {
    // 개별 필드만 다시 그림 — 미리 기입된 필드는 템플릿 원본 그대로 유지.
    for (const name of touchedFieldNames) {
      try {
        const field = pdfForm.getField(name)
        if (field instanceof PDFTextField) {
          field.updateAppearances(customFont)
        }
      } catch { /* missing field — skip */ }
    }
  } else {
    pdfForm.updateFieldAppearances(customFont)
  }

  if (PDF_NEED_APPEARANCES === 'false') {
    acroFormDict.set(PDFName.of('NeedAppearances'), PDFBool.False)
  } else if (PDF_NEED_APPEARANCES === 'true') {
    // Let Acrobat regenerate APs using its own fonts so Korean typing works.
    acroFormDict.set(PDFName.of('NeedAppearances'), PDFBool.True)
  }
  // 'unset' → leave the key as-is from the template.
}

export type FillOptions = {
  includeSignature?: boolean
  allowedVaccines?: string[]
  /** 추가 필드 (예: Invoice/ESD의 tube_count). caseRow.data 에 병합되어 source 로 읽힘. */
  extras?: Record<string, unknown>
}

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
  const data = { ...(caseRow.data ?? {}), ...(options?.extras ?? {}) } as Record<string, unknown>
  // extras(예: tube_count, consignee_lab)는 resolveField가 `caseRow.data` 를
  // 통해 읽으므로, solo fill 경로에서도 extras 가 적용되도록 data 를 주입한
  // 사본을 만들어 soloDoc 에 전달한다.
  const caseRowWithExtras: CaseRow = options?.extras ? { ...caseRow, data } : caseRow

  // Date reformatter for form-level dateFormat override (e.g. Annex III uses dd/mm/yyyy).
  // Converts a stand-alone YYYY-MM-DD or YYYY/MM/DD token to dd/mm/yyyy.
  const toDmy = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
  const toMdy_1 = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`)
  const toSlashYmd = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
  const MONTHS_SHORT_1 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const toDmmmY_1 = (s: string): string =>
    s.replace(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, (_, y, m, d) => `${String(d).padStart(2, '0')}/${MONTHS_SHORT_1[Number(m) - 1] ?? m}/${y}`)
  const reformatDate = form.dateFormat === 'dmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? toDmy(s) : s)
    : form.dateFormat === 'mdy_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? toMdy_1(s) : s)
    : form.dateFormat === 'ymd_slash'
    ? (s: unknown): unknown => (typeof s === 'string' ? toSlashYmd(s) : s)
    : form.dateFormat === 'dmmmy'
    ? (s: unknown): unknown => (typeof s === 'string' ? toDmmmY_1(s) : s)
    : (s: unknown): unknown => s

  // Route single-case fills through the same multi-case resolver so
  // aggregate transforms (multi:species_en, multi:count, multi:microchip[n])
  // and row-based resolution stay consistent with fillPdfMulti.
  const soloDoc: PackedDoc = {
    cases: [caseRowWithExtras],
    vaccSlots: [],
    animalSlots: [0],
    parasiteSlots: [0],
  }
  // Populate vacc slots so vacc_rowN_* fields still fill for single-animal docs.
  const doses = Math.max(1, rabiesDoseCount(caseRowWithExtras))
  for (let d = 0; d < doses; d++) soloDoc.vaccSlots.push({ caseIdx: 0, doseIdx: d })

  const missing: string[] = []
  const empty: string[] = []
  const filled: Record<string, string | boolean> = {}
  const touchedFields = new Set<string>()
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
    if (field instanceof PDFCheckBox) {
      if (value === true) field.check()
      else field.uncheck()
      touchedFields.add(fieldName)
    } else if (field instanceof PDFDropdown) {
      if (typeof value === 'string' && value) {
        try { field.select(value) } catch { /* option not found */ }
        touchedFields.add(fieldName)
      }
    } else if (field instanceof PDFTextField) {
      let text = typeof value === 'string' ? value : ''
      // Fall back to mapping.default when a transform returned empty.
      // Used for N/A placeholders on row/slot fields that shouldn't be blank.
      if (!text && mapping.default) text = mapping.default
      // preserveTemplateText: 매핑돼있지만 값이 빈 필드는 템플릿 값 유지
      if (form.preserveTemplateText && !text) continue
      text = sanitizeForFont(text)
      field.setText(text)
      touchedFields.add(fieldName)
      if (mapping.align) {
        field.setAlignment(
          mapping.align === 'center' ? TextAlignment.Center
          : mapping.align === 'right' ? TextAlignment.Right
          : TextAlignment.Left,
        )
      }
    }
  }

  await applyFontFixes(pdf, pdfForm, customFont, form.preserveTemplateText ? touchedFields : undefined)

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
      page.drawText(sanitizeForFont(t.text), { x: t.x, y: t.y, size: t.size ?? 10, font: customFont })
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
