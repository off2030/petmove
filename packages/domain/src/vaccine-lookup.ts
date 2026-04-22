/**
 * 백신/구충제 제품 조회. data/vaccine-products.json 기반.
 * 접종일 또는 체중으로 적절한 batch/제조사/제품명을 찾아 반환.
 */
import productsData from './data/vaccine-products.json'

export interface VaccineProduct {
  vaccine?: string
  product?: string
  manufacturer: string
  batch: string | null
  expiry: string | null  // YYYY-MM-DD or YYYY-MM (바이알 실제 유효기한)
  year?: number
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
  heartworm_dog: VaccineProduct[]
  heartworm_cat: VaccineProduct[]
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
  // 접종일 <= expiry 중 expiry가 가장 빠른 것 = 접종일 시점에 유효했던 batch
  const candidates = list
    .filter(p => p.expiry && vaccinationDate <= p.expiry)
    .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1))
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

function lookupByWeightAndDate(
  list: VaccineProduct[],
  vaccinationDate: string,
  weightKg = 0,
): VaccineProduct | null {
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  // 체중 범위가 있는 entry 를 먼저 weight 로 필터 → date 기준으로 pick.
  // 체중 범위 entry 가 없거나 매칭 없으면 date 기준으로만 pick.
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

export function lookupExternalParasite(
  species: 'dog' | 'cat',
  vaccinationDate: string,
  weightKg = 0,
): VaccineProduct | null {
  const list = species === 'dog' ? DATA.parasite_external_dog : DATA.parasite_external_cat
  return lookupByWeightAndDate(list, vaccinationDate, weightKg)
}

export function lookupInternalParasite(
  species: 'dog' | 'cat',
  vaccinationDate: string,
  weightKg = 0,
): VaccineProduct | null {
  const list = species === 'dog' ? DATA.parasite_internal_dog : DATA.parasite_internal_cat
  return lookupByWeightAndDate(list, vaccinationDate, weightKg)
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

/** 심장사상충: 체중 범위로 batch 조회 (Heartgard Plus 규격). */
export function lookupHeartworm(species: 'dog' | 'cat', weightKg: number): VaccineProduct | null {
  if (!weightKg || weightKg <= 0) return null
  const list = species === 'dog' ? DATA.heartworm_dog : DATA.heartworm_cat
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

interface ParasiteSection {
  id?: string
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
  // 체중 범위 있는 entry 가 있으면 strictly-weighted 매칭 우선.
  // weight 범위 없는(legacy) entry 는 전 체중 대응 성격이라 strictly-weighted
  // 매칭이 있으면 경쟁하지 않도록 제외.
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
  meta: string // 연도/체중 등 추가 정보
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


/**
 * 카테고리별 표시 정책:
 *  - rabies(광견병): 전체 누적
 *  - 기타 접종(comprehensive/civ/kennel_cough): 만료년도가 (현재년-2) 이상인 것만
 *  - 구충제(parasite_, heartworm_ prefix): 제품(displayName+manufacturer) 별 가장 최신 만료 1건만
 */
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

export function getAllProducts(now = new Date()): FlatProduct[] {
  const currentYear = now.getFullYear()
  const minYear = currentYear - 2

  const result: FlatProduct[] = []
  for (const [category, list] of Object.entries(DATA)) {
    if (!Array.isArray(list)) continue
    const meta = CATEGORY_META[category]
    if (!meta) continue
    const label = meta.label

    let items = list as VaccineProduct[]

    // 기타 접종: 직전 2년분만 (만료일 기준)
    if (isOtherVaccineCategory(category)) {
      items = items.filter((p) => {
        if (!p.expiry) return false
        const y = Number(p.expiry.slice(0, 4))
        return y >= minYear
      })
    }

    // 구충제: 제품×체중범위 조합별 가장 최신 만료 1건
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

  // 구충제: 강아지/고양이 통합 dedup — (라벨 + 제품명 + 제조사 + 체중범위/연도) 기준 최신 만료만 유지
  // meta 에 size·year 가 포함돼 있어 체중 세분화된 variant 를 각각 별도로 보존함.
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

/**
 * 가장 최근 제품만 남긴 목록 (상단 요약·알림 카운트용).
 * - 구충제·심장사상충: 체중 variant 별로 분리해 최신 expiry 1개씩.
 *   예: NexGard Spectra 4개 weight variant 는 각각 별도 entry 로 유지.
 * - 그 외(rabies/comprehensive/civ/kennel): 카테고리 단위로 최신 expiry 1개만.
 *   제품명·제조사 다르더라도 카테고리 안의 최신 재고 기준. 예: CIV 에
 *   CaniFlu-Max(구 재고, 만료) + Fluvax H3N2(신 재고) 있으면 Fluvax 만.
 */
export function getLatestProducts(now = new Date()): FlatProduct[] {
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

/** 30일 이내 만료 or 이미 만료된 제품 개수 — 최근 제품 기준. */
export function countExpiringProducts(now = new Date()): number {
  return getLatestProducts(now).filter(p => p.status === 'expired' || p.status === 'urgent').length
}
