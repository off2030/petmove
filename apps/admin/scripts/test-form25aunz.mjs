// AU/NZ Form25 smoke test — mirrors lib/pdf-fill.ts transforms.
import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function lookupByDateRange(list, date) {
  if (!date) return null
  const c = list.filter(p => p.expiry && date <= p.expiry).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
  return c[0] ?? null
}
function lookupRabies(date) { const y = Number(String(date).slice(0, 4)); return vaccines.rabies.find(r => r.year === y) ?? null }
function lookupComprehensive(sp, date) { return lookupByDateRange(sp === 'dog' ? vaccines.comprehensive_dog : vaccines.comprehensive_cat, date) }
function lookupCiv(date) { return lookupByDateRange(vaccines.civ, date) }
function lookupKennelCough() { return vaccines.kennel_cough?.[0] ?? null }
function lookupExt(sp, date) {
  const list = sp === 'dog' ? vaccines.parasite_external_dog : vaccines.parasite_external_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, date)
}
function lookupInt(sp, date) {
  const list = sp === 'dog' ? vaccines.parasite_internal_dog : vaccines.parasite_internal_cat
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return lookupByDateRange(list, date)
}

const PARASITE_FAMILIES = [
  { id: 'frontline_plus_dog',    name: 'Frontline Plus',    species: 'dog', kind: 'external' },
  { id: 'frontline_spray_cat',   name: 'Frontline Spray',   species: 'cat', kind: 'external' },
  { id: 'drontal_plus_dog',      name: 'Drontal Plus',      species: 'dog', kind: 'internal' },
  { id: 'drontal_plus_cat',      name: 'Drontal Plus',      species: 'cat', kind: 'internal' },
  { id: 'nexgard_spectra_dog',   name: 'NexGard Spectra',   species: 'dog', kind: 'combo' },
  { id: 'nexgard_cat_combo_cat', name: 'NexGard Cat Combo', species: 'cat', kind: 'combo' },
]
function getParasiteFamily(id) { return PARASITE_FAMILIES.find(p => p.id === id) ?? null }
function lookupParasiteById(id, ctx) {
  const fam = getParasiteFamily(id); if (!fam) return null
  const list = vaccines[`parasite_${fam.kind}_${fam.species}`] ?? []
  const matches = list.filter(p => p.id === id)
  let pick
  if (fam.kind === 'combo' && ctx.weightKg) {
    pick = matches.find(p => (p.weightMin === undefined || ctx.weightKg >= p.weightMin) && (p.weightMax === undefined || ctx.weightKg <= p.weightMax))
  } else if (ctx.date) {
    const c = matches.filter(p => p.expiry && ctx.date <= p.expiry).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
    pick = c[0] ?? matches[0]
  } else pick = matches[0]
  return { product: pick?.product ?? fam.name, manufacturer: pick?.manufacturer ?? fam.manufacturer, batch: pick?.batch ?? null, expiry: pick?.expiry ?? null }
}

function sortedDesc(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => (typeof i === 'string' ? i : i?.date)).filter(d => typeof d === 'string' && d).slice().sort((a, b) => b.localeCompare(a))
}
function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => (typeof i === 'string' ? { date: i } : i)).filter(r => r && r.date).slice().sort((a, b) => b.date.localeCompare(a.date))
}
function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }
function fmtDateDMY(s) { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
function ageParts(b) {
  const m = String(b ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null
  const by = +m[1], bm = +m[2] - 1, bd = +m[3], now = new Date()
  let y = now.getFullYear() - by, mo = now.getMonth() - bm
  if (now.getDate() < bd) mo -= 1
  if (mo < 0) { y -= 1; mo += 12 }
  return y < 0 ? null : { years: y, months: mo }
}
function fmtPhone(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
  return s
}

// Expanded sequence builder (AU/NZ 8-slot)
function latestAsc(arr, n) { return sortedDescRecords(arr).slice(0, n).reverse() }
function buildExpandedVaccineSequence(data, maxPerType = 3) {
  const sp = String(data.species ?? '').toLowerCase()
  const has = sp === 'dog' || sp === 'cat'
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const out = []

  for (const rec of latestAsc(data.general_vaccine_dates, maxPerType)) {
    const p = has ? lookupComprehensive(sp, rec.date) : null
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) })
  }
  for (const rec of latestAsc(data.civ_dates, maxPerType)) {
    const p = lookupCiv(rec.date)
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) })
  }
  for (const rec of latestAsc(data.kennel_cough_dates, maxPerType)) {
    const p = lookupKennelCough()
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) })
  }

  const extRecords = latestAsc(data.external_parasite_dates, maxPerType)
  const comboKeys = new Set()
  for (const rec of extRecords) {
    if (rec.product_id && getParasiteFamily(rec.product_id)?.kind === 'combo') comboKeys.add(`${rec.product_id}@${rec.date}`)
  }
  const buildParasite = (rec, side) => {
    if (rec.product_id) {
      const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
      return { type: 'Parasiticide', name: p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) }
    }
    const p = has ? (side === 'external' ? lookupExt(sp, rec.date) : lookupInt(sp, rec.date)) : null
    return { type: 'Parasiticide', name: p?.product || p?.vaccine || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) }
  }
  for (const rec of extRecords) out.push(buildParasite(rec, 'external'))
  for (const rec of latestAsc(data.internal_parasite_dates, maxPerType)) {
    if (rec.product_id && getParasiteFamily(rec.product_id)?.kind === 'combo') {
      if (comboKeys.has(`${rec.product_id}@${rec.date}`)) continue
    }
    out.push(buildParasite(rec, 'internal'))
  }
  return out
}

function readSource(src, caseRow) {
  if (src === 'customer_name_en') {
    const f = (caseRow.data.customer_first_name_en ?? '').trim()
    const l = (caseRow.data.customer_last_name_en ?? '').trim()
    if (f || l) return [f, l].filter(Boolean).join(' ')
    return caseRow.customer_name_en ?? caseRow.customer_name
  }
  if (src === 'animal_description') {
    const breed = String(caseRow.data.breed_en ?? '').trim()
    const color = String(caseRow.data.color_en ?? '').trim()
    const w = String(caseRow.data.weight ?? '').trim()
    const parts = []
    if (breed) parts.push(breed)
    if (color) parts.push(color)
    if (w) parts.push(`${w}kg`)
    return parts.join(', ')
  }
  const fromRow = caseRow[src]
  return fromRow != null ? fromRow : caseRow.data?.[src]
}

function resolve(mapping, caseRow) {
  const { source, transform } = mapping
  const raw = source ? readSource(source, caseRow) : null
  const data = caseRow.data ?? {}
  if (transform === 'checkbox:always_true') return true
  let m
  if ((m = transform?.match(/^checkbox:eq:(.+)$/))) return String(raw ?? '') === m[1]
  if ((m = transform?.match(/^checkbox:in:(.+)$/))) return m[1].split('|').includes(String(raw ?? ''))
  if (transform === 'checkbox:truthy') return !!(raw != null && raw !== '')
  if (transform === 'checkbox:falsy') return !(raw != null && raw !== '')
  if (transform === 'age_years') { const a = ageParts(raw); return a ? String(a.years) : '' }
  if (transform === 'age_months') { const a = ageParts(raw); return a ? String(a.months) : '' }
  if (transform === 'date_dmy') return fmtDateDMY(raw)
  if (transform === 'phone_dash') return fmtPhone(raw)
  if ((m = transform?.match(/^cmp:num:(lt|le|gt|ge|eq|between|gt_lt):(.+)$/))) {
    const n = Number(String(raw ?? '').replace(/[^\d.]/g, '')); if (!Number.isFinite(n)) return false
    const op = m[1], a = m[2].split(':').map(Number)
    if (op === 'lt') return n < a[0]
    if (op === 'le') return n <= a[0]
    if (op === 'gt') return n > a[0]
    if (op === 'ge') return n >= a[0]
    if (op === 'eq') return n === a[0]
    if (op === 'between') return n >= a[0] && n < a[1]
    if (op === 'gt_lt') return n > a[0] && n < a[1]
    return false
  }
  if ((m = transform?.match(/^has\[(\d+)\]$/))) return !!sortedDesc(raw).slice().reverse()[+m[1]]
  if ((m = transform?.match(/^vaccine:(rabies|ext_parasite|int_parasite):(name|manufacturer|serial|date)\[(\d+)\]$/))) {
    const kind = m[1], attr = m[2], n = +m[3]
    const date = sortedDesc(raw).slice().reverse()[n]
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    const sp = String(data.species ?? '').toLowerCase()
    let p = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'ext_parasite' && (sp === 'dog' || sp === 'cat')) p = lookupExt(sp, date)
    else if (kind === 'int_parasite' && (sp === 'dog' || sp === 'cat')) p = lookupInt(sp, date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    return ''
  }
  if ((m = transform?.match(/^expanded_vacc_seq:(type|name|manufacturer|serial|date)\[(\d+)\]$/))) {
    const entry = buildExpandedVaccineSequence(data)[+m[2]]
    return entry ? entry[m[1]] : ''
  }
  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDate(raw)
  return typeof raw === 'string' ? raw : String(raw)
}

const caseRow = {
  id: 't1', customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  pet_name: '콩이', pet_name_en: 'Kongi',
  microchip: '410123456789012', destination: '호주',
  data: {
    phone: '01012345678',
    address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    species: 'dog', breed_en: 'Maltese', color_en: 'White',
    sex: 'neutered_male', weight: '5',
    birth_date: '2020-03-15', vet_visit_date: '2026-06-20',
    rabies_dates: ['2024-05-01', '2023-05-01'],
    general_vaccine_dates: ['2024-06-01', '2025-06-10', '2026-06-15'],
    civ_dates: ['2025-07-01', '2026-07-05'],
    kennel_cough_dates: ['2026-08-01'],
    external_parasite_dates: [
      { date: '2026-05-01', product_id: 'frontline_plus_dog' },
      { date: '2026-05-20', product_id: 'nexgard_spectra_dog' },
    ],
    internal_parasite_dates: [
      { date: '2026-05-01' },
      { date: '2026-05-20', product_id: 'nexgard_spectra_dog' },
    ],
  },
}

// Dump sequence
const seq = buildExpandedVaccineSequence(caseRow.data)
console.log(`\nExpanded sequence (${seq.length} entries):`)
seq.forEach((e, i) => console.log(`  slot${i + 1}: ${e.type.padEnd(12)} · ${(e.name || '(blank)').padEnd(22)} · serial=${e.serial || '-'} · ${e.date}`))

const form = mappings.Form25AuNz
const pdf = await PDFDocument.load(await readFile(path.join('data/pdf-templates', form.template)))
pdf.registerFontkit(fontkit)
const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const pdfForm = pdf.getForm()
const missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = resolve(mp, caseRow)
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFCheckBox') {
      if (v === true) f.check(); else f.uncheck()
    } else if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) {
      f.setText(v)
    }
  } catch {
    missing.push(name)
  }
}
pdfForm.updateFieldAppearances(font)
if (missing.length) console.warn('missing:', missing)
await writeFile('data/pdf-analysis/form25aunz_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/form25aunz_test.pdf')
