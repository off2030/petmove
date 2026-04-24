/**
 * 백신/구충제 제품 조회.
 *
 * Phase 2: 데이터 소스가 org 별 DB (org_vaccine_products) 로 이전됨.
 * - Factory `createVaccineLookups(data)` 를 사용해 org 별 데이터 바인딩.
 * - 레거시 named exports (lookupRabies 등) 는 기존 JSON seed 를 기본값으로 유지 (테스트 스크립트용).
 *   실제 admin 앱에서는 provider/서버 helper 로 org-scoped lookups 를 사용해야 함.
 */
import productsData from './data/vaccine-products.json'

export interface VaccineProduct {
  id?: string  // parasite_id — parasite family 식별자. 접종 카테고리에는 없음.
  vaccine?: string
  product?: string
  manufacturer: string
  batch: string | null
  expiry: string | null  // YYYY-MM-DD or YYYY-MM
  year?: number
  weightMin?: number
  weightMax?: number
  size?: string
}

export interface VaccineProductsData {
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
  heartworm_dog: VaccineProduct[]
  heartworm_cat: VaccineProduct[]
}

export function emptyVaccineProductsData(): VaccineProductsData {
  return {
    rabies: [],
    comprehensive_dog: [],
    comprehensive_cat: [],
    civ: [],
    kennel_cough: [],
    parasite_combo_dog: [],
    parasite_combo_cat: [],
    parasite_external_dog: [],
    parasite_external_cat: [],
    parasite_internal_dog: [],
    parasite_internal_cat: [],
    heartworm_dog: [],
    heartworm_cat: [],
  }
}

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

// ─── Lookup results (shared types) ───

export interface RabiesLookupResult extends VaccineProduct {
  validityFrom: string
  validityTo: string
}

// ─── Parasite families (static registry, unaffected by org data) ───

export type ParasiteKind = 'external' | 'internal' | 'combo'
export interface ParasiteFamily {
  id: string
  name: string
  manufacturer: string
  species: 'dog' | 'cat'
  kind: ParasiteKind
}

export const PARASITE_FAMILIES: ParasiteFamily[] = [
  { id: 'frontline_plus_dog',  name: 'Frontline Plus',  manufacturer: 'Boehringer Ingelheim', species: 'dog', kind: 'external' },
  { id: 'frontline_spray_cat', name: 'Frontline Spray', manufacturer: 'Boehringer Ingelheim', species: 'cat', kind: 'external' },
  { id: 'drontal_plus_dog',    name: 'Drontal Plus',    manufacturer: 'Elanco',                species: 'dog', kind: 'internal' },
  { id: 'drontal_plus_cat',    name: 'Drontal Plus',    manufacturer: 'Elanco',                species: 'cat', kind: 'internal' },
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

// ─── Flat product display types (used by management page) ───

export type ProductSection = '접종' | '구충'
export type ProductSpecies = 'common' | 'dog' | 'cat'

export interface FlatProduct {
  category: string
  categoryLabel: string
  section: ProductSection
  species: ProductSpecies
  displayName: string
  manufacturer: string
  batch: string | null
  expiry: string | null
  status: ExpiryStatus
  daysLeft: number | null
  meta: string
}

interface CategoryMeta {
  label: string
  section: ProductSection
  species: ProductSpecies
}
const CATEGORY_META: Record<string, CategoryMeta> = {
  rabies:                { label: '광견병',                  section: '접종', species: 'common' },
  comprehensive_dog:     { label: '종합백신 (강아지)',       section: '접종', species: 'dog' },
  comprehensive_cat:     { label: '종합백신 (고양이)',       section: '접종', species: 'cat' },
  civ:                   { label: 'CIV 독감',                section: '접종', species: 'dog' },
  kennel_cough:          { label: '켄넬코프 (강아지)',       section: '접종', species: 'dog' },
  parasite_internal_dog: { label: '내부 구충',               section: '구충', species: 'common' },
  parasite_internal_cat: { label: '내부 구충',               section: '구충', species: 'common' },
  parasite_external_dog: { label: '외부 구충 (강아지)',      section: '구충', species: 'dog' },
  parasite_external_cat: { label: '외부 구충 (고양이)',      section: '구충', species: 'cat' },
  parasite_combo_dog:    { label: '내외부 구충 합제 (강아지)', section: '구충', species: 'dog' },
  parasite_combo_cat:    { label: '내외부 구충 합제 (고양이)', section: '구충', species: 'cat' },
  heartworm_dog:         { label: '심장사상충 (강아지)',     section: '구충', species: 'dog' },
  heartworm_cat:         { label: '심장사상충 (고양이)',     section: '구충', species: 'cat' },
}

function isParasiteCategory(category: string): boolean {
  return category.startsWith('parasite_') || category.startsWith('heartworm_')
}
function isOtherVaccineCategory(category: string): boolean {
  return (
    category.startsWith('comprehensive_') ||
    category === 'civ' ||
    category === 'kennel_cough'
  )
}

// ─── Factory: org-scoped lookup bundle ───

export interface VaccineLookups {
  lookupRabies: (vaccinationDate: string) => RabiesLookupResult | null
  lookupComprehensive: (species: 'dog' | 'cat', vaccinationDate: string) => VaccineProduct | null
  lookupCiv: (vaccinationDate: string) => VaccineProduct | null
  lookupKennelCough: () => VaccineProduct | null
  lookupExternalParasite: (species: 'dog' | 'cat', vaccinationDate: string, weightKg?: number) => VaccineProduct | null
  lookupInternalParasite: (species: 'dog' | 'cat', vaccinationDate: string, weightKg?: number) => VaccineProduct | null
  lookupParasiteCombo: (species: 'dog' | 'cat', weightKg: number) => VaccineProduct | null
  lookupHeartworm: (species: 'dog' | 'cat', weightKg: number) => VaccineProduct | null
  lookupParasiteById: (id: string, ctx: { date?: string; weightKg?: number }) => VaccineProduct | null
  getAllProducts: (now?: Date) => FlatProduct[]
  getLatestProducts: (now?: Date) => FlatProduct[]
  countExpiringProducts: (now?: Date) => number
}

export function createVaccineLookups(data: VaccineProductsData): VaccineLookups {
  function lookupByDateRange(list: VaccineProduct[], vaccinationDate: string): VaccineProduct | null {
    if (!vaccinationDate) return null
    const candidates = list
      .filter(p => p.expiry && vaccinationDate <= p.expiry)
      .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1))
    return candidates[0] ?? null
  }

  function lookupByWeightAndDate(
    list: VaccineProduct[],
    vaccinationDate: string,
    weightKg = 0,
  ): VaccineProduct | null {
    if (list.length === 0) return null
    if (list.length === 1) return list[0]
    const hasWeightEntries = list.some(p => p.weightMin !== undefined || p.weightMax !== undefined)
    if (hasWeightEntries && weightKg > 0) {
      const strictlyWeighted = list.filter(p =>
        (p.weightMin !== undefined || p.weightMax !== undefined) &&
        (p.weightMin === undefined || weightKg >= p.weightMin) &&
        (p.weightMax === undefined || weightKg <= p.weightMax)
      )
      if (strictlyWeighted.length > 0) {
        return lookupByDateRange(strictlyWeighted, vaccinationDate) ?? strictlyWeighted[0]
      }
    }
    return lookupByDateRange(list, vaccinationDate)
  }

  function lookupRabies(vaccinationDate: string): RabiesLookupResult | null {
    if (!vaccinationDate) return null
    const year = Number(vaccinationDate.slice(0, 4))
    if (!year) return null

    // 광견병은 두 시대의 데이터가 혼재.
    // (1) year 필드를 가진 구세대 레코드 — 접종 연도로 엄격 매칭. 2025년까지는 이 방식만.
    // (2) 마지막 year 레코드(= 현재 G98321/2026)는 자기 year 이후 접종에 대해
    //     expiry 까지 fallback 으로 계속 매칭. 즉 2027-10-07 전까지 G98321 이 선택됨.
    // (3) year 필드가 없는 신규 레코드 — 다른 백신과 동일하게 date-range 매칭.
    //     G98321 만료 후 등록될 신규 batch 가 여기에 해당.
    const yearBased = data.rabies.filter(r => r.year != null)
    const maxYear = yearBased.reduce((m, r) => Math.max(m, r.year!), 0)

    let entry: VaccineProduct | undefined
    if (year <= maxYear) {
      entry = yearBased.find(r => r.year === year)
    } else {
      entry = yearBased
        .filter(r => r.expiry && vaccinationDate <= r.expiry)
        .sort((a, b) => (b.year! - a.year!))[0]
      if (!entry) {
        const noYearList = data.rabies.filter(r => r.year == null)
        entry = lookupByDateRange(noYearList, vaccinationDate) ?? undefined
      }
    }

    if (!entry) return null
    return {
      ...entry,
      validityFrom: vaccinationDate,
      validityTo: addYears(vaccinationDate, 1),
    }
  }

  function lookupComprehensive(species: 'dog' | 'cat', vaccinationDate: string): VaccineProduct | null {
    const list = species === 'dog' ? data.comprehensive_dog : data.comprehensive_cat
    return lookupByDateRange(list, vaccinationDate)
  }

  function lookupCiv(vaccinationDate: string): VaccineProduct | null {
    return lookupByDateRange(data.civ, vaccinationDate)
  }

  function lookupKennelCough(): VaccineProduct | null {
    return data.kennel_cough[0] ?? null
  }

  function lookupExternalParasite(
    species: 'dog' | 'cat',
    vaccinationDate: string,
    weightKg = 0,
  ): VaccineProduct | null {
    const list = species === 'dog' ? data.parasite_external_dog : data.parasite_external_cat
    return lookupByWeightAndDate(list, vaccinationDate, weightKg)
  }

  function lookupInternalParasite(
    species: 'dog' | 'cat',
    vaccinationDate: string,
    weightKg = 0,
  ): VaccineProduct | null {
    const list = species === 'dog' ? data.parasite_internal_dog : data.parasite_internal_cat
    return lookupByWeightAndDate(list, vaccinationDate, weightKg)
  }

  function lookupParasiteCombo(species: 'dog' | 'cat', weightKg: number): VaccineProduct | null {
    if (!weightKg || weightKg <= 0) return null
    const list = species === 'dog' ? data.parasite_combo_dog : data.parasite_combo_cat
    return list.find(p =>
      (p.weightMin === undefined || weightKg >= p.weightMin) &&
      (p.weightMax === undefined || weightKg <= p.weightMax)
    ) ?? null
  }

  function lookupHeartworm(species: 'dog' | 'cat', weightKg: number): VaccineProduct | null {
    if (!weightKg || weightKg <= 0) return null
    const list = species === 'dog' ? data.heartworm_dog : data.heartworm_cat
    return list.find(p =>
      (p.weightMin === undefined || weightKg >= p.weightMin) &&
      (p.weightMax === undefined || weightKg <= p.weightMax)
    ) ?? null
  }

  function lookupParasiteById(id: string, ctx: { date?: string; weightKg?: number }): VaccineProduct | null {
    const family = getParasiteFamily(id)
    if (!family) return null
    const sectionKey = `parasite_${family.kind}_${family.species}` as keyof VaccineProductsData
    const list = (data[sectionKey] ?? []) as VaccineProduct[]
    const matches = list.filter(p => p.id === id)

    let pick: VaccineProduct | undefined
    const hasWeightEntries = matches.some(p => p.weightMin !== undefined || p.weightMax !== undefined)
    if (hasWeightEntries && ctx.weightKg) {
      const strictlyWeighted = matches.filter(p =>
        (p.weightMin !== undefined || p.weightMax !== undefined) &&
        (p.weightMin === undefined || ctx.weightKg! >= p.weightMin) &&
        (p.weightMax === undefined || ctx.weightKg! <= p.weightMax)
      )
      if (strictlyWeighted.length > 0) {
        if (ctx.date) {
          pick = strictlyWeighted
            .filter(p => p.expiry && ctx.date! <= p.expiry)
            .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1))[0] ?? strictlyWeighted[0]
        } else {
          pick = strictlyWeighted[0]
        }
      }
    }
    if (!pick && ctx.date) {
      const candidates = matches
        .filter(p => p.expiry && ctx.date! <= p.expiry)
        .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1))
      pick = candidates[0] ?? matches[0]
    }
    if (!pick) pick = matches[0]

    return {
      product: pick?.product ?? family.name,
      manufacturer: pick?.manufacturer ?? family.manufacturer,
      batch: pick?.batch ?? null,
      expiry: pick?.expiry ?? null,
    }
  }

  function getAllProducts(now = new Date()): FlatProduct[] {
    const currentYear = now.getFullYear()
    const minYear = currentYear - 2

    const result: FlatProduct[] = []
    for (const [category, list] of Object.entries(data)) {
      if (!Array.isArray(list)) continue
      const meta = CATEGORY_META[category]
      if (!meta) continue
      const label = meta.label

      let items = list as VaccineProduct[]

      if (isOtherVaccineCategory(category)) {
        items = items.filter((p) => {
          if (!p.expiry) return false
          const y = Number(p.expiry.slice(0, 4))
          return y >= minYear
        })
      }

      if (isParasiteCategory(category)) {
        const latestByKey = new Map<string, VaccineProduct>()
        for (const p of items) {
          const weightKey = p.size ?? `${p.weightMin ?? ''}-${p.weightMax ?? ''}`
          const key = `${p.product || p.vaccine || ''}|${p.manufacturer}|${weightKey}`
          const cur = latestByKey.get(key)
          if (!cur) {
            latestByKey.set(key, p)
            continue
          }
          const a = cur.expiry ?? ''
          const b = p.expiry ?? ''
          if (b > a) latestByKey.set(key, p)
        }
        items = Array.from(latestByKey.values())
      }

      for (const p of items) {
        const metaParts: string[] = []
        if (p.year) metaParts.push(`${p.year}년`)
        if (p.size) metaParts.push(p.size)
        result.push({
          category,
          categoryLabel: label,
          section: meta.section,
          species: meta.species,
          displayName: p.vaccine || p.product || '(이름 없음)',
          manufacturer: p.manufacturer,
          batch: p.batch,
          expiry: p.expiry,
          status: getExpiryStatus(p.expiry, now),
          daysLeft: daysUntilExpiry(p.expiry, now),
          meta: metaParts.join(' · '),
        })
      }
    }

    const dedupKey = (p: FlatProduct) =>
      `${p.categoryLabel}|${p.displayName}|${p.manufacturer}|${p.meta}`
    const latest = new Map<string, FlatProduct>()
    const passthrough: FlatProduct[] = []
    for (const p of result) {
      if (!isParasiteCategory(p.category)) {
        passthrough.push(p)
        continue
      }
      const k = dedupKey(p)
      const cur = latest.get(k)
      if (!cur || (p.expiry ?? '') > (cur.expiry ?? '')) latest.set(k, p)
    }
    return [...passthrough, ...latest.values()]
  }

  function getLatestProducts(now = new Date()): FlatProduct[] {
    const all = getAllProducts(now)
    const latest = new Map<string, FlatProduct>()
    for (const p of all) {
      const sizeOnly = p.meta.split(' · ').filter(part => !/년$/.test(part)).join(' · ')
      const key = isParasiteCategory(p.category)
        ? `${p.category}|${sizeOnly}`
        : p.category
      const cur = latest.get(key)
      if (!cur || (p.expiry ?? '') > (cur.expiry ?? '')) latest.set(key, p)
    }
    return Array.from(latest.values())
  }

  function countExpiringProducts(now = new Date()): number {
    return getLatestProducts(now).filter(p => p.status === 'expired' || p.status === 'urgent').length
  }

  return {
    lookupRabies,
    lookupComprehensive,
    lookupCiv,
    lookupKennelCough,
    lookupExternalParasite,
    lookupInternalParasite,
    lookupParasiteCombo,
    lookupHeartworm,
    lookupParasiteById,
    getAllProducts,
    getLatestProducts,
    countExpiringProducts,
  }
}

// ─── Legacy default exports (JSON seed) ───
// 테스트 스크립트 및 아직 factory 로 이전 안 된 caller 용 fallback.
// 실제 admin 앱 runtime 에서는 org-scoped lookups (provider / 서버 helper) 를 사용.

const DEFAULT_DATA = productsData as unknown as VaccineProductsData
const defaults = createVaccineLookups(DEFAULT_DATA)

export const lookupRabies = defaults.lookupRabies
export const lookupComprehensive = defaults.lookupComprehensive
export const lookupCiv = defaults.lookupCiv
export const lookupKennelCough = defaults.lookupKennelCough
export const lookupExternalParasite = defaults.lookupExternalParasite
export const lookupInternalParasite = defaults.lookupInternalParasite
export const lookupParasiteCombo = defaults.lookupParasiteCombo
export const lookupHeartworm = defaults.lookupHeartworm
export const lookupParasiteById = defaults.lookupParasiteById
export const getAllProducts = defaults.getAllProducts
export const getLatestProducts = defaults.getLatestProducts
export const countExpiringProducts = defaults.countExpiringProducts
