/**
 * 백신/구충제 제품 조회. data/vaccine-products.json 기반.
 * 접종일 또는 체중으로 적절한 batch/제조사/제품명을 찾아 반환.
 */
import productsData from '@/data/vaccine-products.json'

export interface VaccineProduct {
  vaccine?: string
  product?: string
  manufacturer: string
  batch: string | null
  expiry: string | null  // YYYY-MM-DD or YYYY-MM
  year?: number
  validUntil?: string
  weightMin?: number
  weightMax?: number
  size?: string
}

interface ProductsData {
  rabies: VaccineProduct[]
  comprehensive_dog: VaccineProduct[]
  comprehensive_cat: VaccineProduct[]
  civ: VaccineProduct[]
  kennel_cough: VaccineProduct[]
  parasite_combo_dog: VaccineProduct[]
  parasite_combo_cat: VaccineProduct[]
  parasite_external_dog: VaccineProduct[]
  parasite_external_cat: VaccineProduct[]
  parasite_internal_dog: VaccineProduct[]
  parasite_internal_cat: VaccineProduct[]
}

const DATA = productsData as unknown as ProductsData

/** Parse YYYY-MM-DD or YYYY-MM string into a Date (end of month if YYYY-MM) */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const parts = s.split('-')
  if (parts.length < 2) return null
  const y = Number(parts[0])
  const m = Number(parts[1]) - 1
  const d = parts.length === 3 ? Number(parts[2]) : 0
  const date = parts.length === 3 ? new Date(y, m, d) : new Date(y, m + 1, 0) // end of month
  return isNaN(date.getTime()) ? null : date
}

/** Add N years to YYYY-MM-DD, return YYYY-MM-DD */
function addYears(dateStr: string, years: number): string {
  const d = parseDate(dateStr)
  if (!d) return ''
  d.setFullYear(d.getFullYear() + years)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Rabies: year-based ───

export interface RabiesLookupResult extends VaccineProduct {
  validityFrom: string
  validityTo: string
}

/** 접종일의 연도로 batch 조회 + 유효기간(접종일+1년) 계산 */
export function lookupRabies(vaccinationDate: string): RabiesLookupResult | null {
  if (!vaccinationDate) return null
  const year = Number(vaccinationDate.slice(0, 4))
  if (!year) return null
  const entry = DATA.rabies.find(r => r.year === year)
  if (!entry) return null
  return {
    ...entry,
    validityFrom: vaccinationDate,
    validityTo: addYears(vaccinationDate, 1),
  }
}

// ─── Date-range based ───

function lookupByDateRange(list: VaccineProduct[], vaccinationDate: string): VaccineProduct | null {
  if (!vaccinationDate) return null
  // 접종일 <= validUntil 중 validUntil이 가장 작은 (=가장 먼저 만료되는) 것
  // = 접종일 시점에 유효했던 batch
  const candidates = list
    .filter(p => p.validUntil && vaccinationDate <= p.validUntil)
    .sort((a, b) => (a.validUntil! < b.validUntil! ? -1 : 1))
  return candidates[0] ?? null
}

export function lookupComprehensive(species: 'dog' | 'cat', vaccinationDate: string): VaccineProduct | null {
  const list = species === 'dog' ? DATA.comprehensive_dog : DATA.comprehensive_cat
  return lookupByDateRange(list, vaccinationDate)
}

export function lookupCiv(vaccinationDate: string): VaccineProduct | null {
  return lookupByDateRange(DATA.civ, vaccinationDate)
}

export function lookupKennelCough(): VaccineProduct | null {
  return DATA.kennel_cough[0] ?? null
}

export function lookupExternalParasite(species: 'dog' | 'cat', vaccinationDate: string): VaccineProduct | null {
  const list = species === 'dog' ? DATA.parasite_external_dog : DATA.parasite_external_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, vaccinationDate)
}

export function lookupInternalParasite(species: 'dog' | 'cat', vaccinationDate: string): VaccineProduct | null {
  const list = species === 'dog' ? DATA.parasite_internal_dog : DATA.parasite_internal_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, vaccinationDate)
}

// ─── Weight-based ───

export function lookupParasiteCombo(species: 'dog' | 'cat', weightKg: number): VaccineProduct | null {
  if (!weightKg || weightKg <= 0) return null
  const list = species === 'dog' ? DATA.parasite_combo_dog : DATA.parasite_combo_cat
  return list.find(p =>
    (p.weightMin === undefined || weightKg >= p.weightMin) &&
    (p.weightMax === undefined || weightKg <= p.weightMax)
  ) ?? null
}

// ─── Parasite product registry (id-based) ───

export type ParasiteKind = 'external' | 'internal' | 'combo'
export interface ParasiteFamily {
  id: string
  name: string
  manufacturer: string
  species: 'dog' | 'cat'
  kind: ParasiteKind
}

/**
 * Authoritative list of parasiticide product families. The catalog stores
 * batches/dates per id; this registry exposes the user-facing options.
 * `kind: 'combo'` means the product treats both internal and external sites.
 */
export const PARASITE_FAMILIES: ParasiteFamily[] = [
  { id: 'frontline_plus_dog',  name: 'Frontline Plus',  manufacturer: 'Boehringer Ingelheim', species: 'dog', kind: 'external' },
  { id: 'frontline_spray_cat', name: 'Frontline Spray', manufacturer: 'Boehringer Ingelheim', species: 'cat', kind: 'external' },
  { id: 'drontal_plus_dog',    name: 'Drontal Plus',    manufacturer: 'Bayer',                species: 'dog', kind: 'internal' },
  { id: 'drontal_plus_cat',    name: 'Drontal Plus',    manufacturer: 'Bayer',                species: 'cat', kind: 'internal' },
  { id: 'nexgard_spectra_dog',  name: 'NexGard Spectra',   manufacturer: 'Boehringer Ingelheim', species: 'dog', kind: 'combo' },
  { id: 'nexgard_cat_combo_cat', name: 'NexGard Cat Combo', manufacturer: 'Boehringer Ingelheim', species: 'cat', kind: 'combo' },
]

export function getParasiteFamily(id: string): ParasiteFamily | null {
  return PARASITE_FAMILIES.find(p => p.id === id) ?? null
}

/** Families applicable to a (species, kind) — defaults + combo (combo applies to both kinds). */
export function listParasiteFamilies(species: 'dog' | 'cat', kind: 'external' | 'internal'): ParasiteFamily[] {
  return PARASITE_FAMILIES.filter(p =>
    p.species === species && (p.kind === kind || p.kind === 'combo')
  )
}

interface ParasiteSection {
  id?: string
  validUntil?: string
  product?: string
  manufacturer?: string
  batch?: string | null
  expiry?: string | null
  weightMin?: number
  weightMax?: number
}

/**
 * Resolve product/manufacturer/batch/expiry for a given product family id.
 * Picks the right batch by date (non-combo) or weight (combo).
 * Falls back to the family registry for product/manufacturer when no batch matches.
 */
export function lookupParasiteById(id: string, ctx: { date?: string; weightKg?: number }): VaccineProduct | null {
  const family = getParasiteFamily(id)
  if (!family) return null
  const sectionKey = `parasite_${family.kind}_${family.species}` as keyof ProductsData
  const list = (DATA[sectionKey] ?? []) as ParasiteSection[]
  const matches = list.filter(p => p.id === id)

  let pick: ParasiteSection | undefined
  if (family.kind === 'combo' && ctx.weightKg) {
    pick = matches.find(p =>
      (p.weightMin === undefined || ctx.weightKg! >= p.weightMin) &&
      (p.weightMax === undefined || ctx.weightKg! <= p.weightMax)
    )
  } else if (ctx.date) {
    const candidates = matches
      .filter(p => p.validUntil && ctx.date! <= p.validUntil)
      .sort((a, b) => (a.validUntil! < b.validUntil! ? -1 : 1))
    pick = candidates[0] ?? matches[0]
  } else {
    pick = matches[0]
  }

  // Use family info as a baseline so the dropdown selection at minimum
  // shows the product/manufacturer name even when no batch entry exists.
  return {
    product: pick?.product ?? family.name,
    manufacturer: pick?.manufacturer ?? family.manufacturer,
    batch: pick?.batch ?? null,
    expiry: pick?.expiry ?? null,
  }
}

// ─── Expiry status ───

export type ExpiryStatus = 'expired' | 'urgent' | 'warning' | 'ok' | 'unknown'

/** 만료 상태: expired / urgent(<=30d) / warning(<=90d) / ok / unknown */
export function getExpiryStatus(expiry: string | null | undefined, now = new Date()): ExpiryStatus {
  if (!expiry) return 'unknown'
  const exp = parseDate(expiry)
  if (!exp) return 'unknown'
  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'expired'
  if (diff <= 30) return 'urgent'
  if (diff <= 90) return 'warning'
  return 'ok'
}

/** 일수 계산 (음수 = 이미 만료) */
export function daysUntilExpiry(expiry: string | null | undefined, now = new Date()): number | null {
  if (!expiry) return null
  const exp = parseDate(expiry)
  if (!exp) return null
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── All products (for management page) ───

export interface FlatProduct {
  category: string
  categoryLabel: string
  displayName: string
  manufacturer: string
  batch: string | null
  expiry: string | null
  status: ExpiryStatus
  daysLeft: number | null
  meta: string // 연도/체중/validUntil 등 추가 정보
}

const CATEGORY_LABELS: Record<string, string> = {
  rabies: '광견병',
  comprehensive_dog: '종합백신 (강아지)',
  comprehensive_cat: '종합백신 (고양이)',
  civ: 'CIV 독감',
  kennel_cough: '켄넬코프 (강아지)',
  parasite_combo_dog: '내외부 구충 합제 (강아지)',
  parasite_combo_cat: '내외부 구충 합제 (고양이)',
  parasite_external_dog: '외부 구충 (강아지)',
  parasite_external_cat: '외부 구충 (고양이)',
  parasite_internal_dog: '내부 구충 (강아지)',
  parasite_internal_cat: '내부 구충 (고양이)',
}

export function getAllProducts(now = new Date()): FlatProduct[] {
  const result: FlatProduct[] = []
  for (const [category, list] of Object.entries(DATA)) {
    if (!Array.isArray(list)) continue
    const label = CATEGORY_LABELS[category] ?? category
    for (const p of list as VaccineProduct[]) {
      const meta: string[] = []
      if (p.year) meta.push(`${p.year}년`)
      if (p.size) meta.push(p.size)
      if (p.validUntil) meta.push(`~${p.validUntil}`)
      result.push({
        category,
        categoryLabel: label,
        displayName: p.vaccine || p.product || '(이름 없음)',
        manufacturer: p.manufacturer,
        batch: p.batch,
        expiry: p.expiry,
        status: getExpiryStatus(p.expiry, now),
        daysLeft: daysUntilExpiry(p.expiry, now),
        meta: meta.join(' · '),
      })
    }
  }
  return result
}

/** 30일 이내 만료 or 이미 만료된 제품 개수 */
export function countExpiringProducts(now = new Date()): number {
  return getAllProducts(now).filter(p => p.status === 'expired' || p.status === 'urgent').length
}
