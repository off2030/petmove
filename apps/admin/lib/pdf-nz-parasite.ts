import { destinationCountry } from '@petmove/domain'

/** Printing defaults only: keep actual treatment dates, explicit products and outside-hospital records. */
export function nzCatParasiteDefaults(destination: string | null, data: Record<string, unknown>): Record<string, unknown> {
  if (!destination || !['뉴질랜드', '뉴질랜드(구)'].includes(destinationCountry(destination)) || String(data.species).toLowerCase() !== 'cat') return data
  const result = { ...data }
  for (const key of ['external_parasite_dates', 'internal_parasite_dates']) {
    const records = data[key]
    if (!Array.isArray(records)) continue
    result[key] = records.map(value => {
      const rec = typeof value === 'string' ? { date: value } : value
      if (!rec || !rec.date || rec.other_hospital || rec.product_id?.trim() || rec.product?.trim()) return value
      return { ...rec, product_id: 'nexgard_cat_combo_cat' }
    })
  }
  return result
}
