// FormAC smoke test — uses existing pdf-fill transforms (array[n], product[n], period[n]).
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function lookupRabies(date) { const y = Number(String(date).slice(0, 4)); return vaccines.rabies.find(r => r.year === y) ?? null }
function sortedDesc(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => (typeof i === 'string' ? i : i?.date)).filter(d => typeof d === 'string' && d).slice().sort((a, b) => b.localeCompare(a))
}
function sortedTiters(records) {
  if (!Array.isArray(records)) return []
  return records.filter(r => r && r.date).slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }

const LAB_INFO = {
  krsl: { name: 'Komipharm Rabies Serology Laboratory', country: 'Republic of Korea' },
  apqa_seoul: { name: 'Animal and Plant Quarantine Agency (APQA) Seoul Office', country: 'Republic of Korea' },
  apqa_hq: { name: 'Animal and Plant Quarantine Agency (APQA)', country: 'Republic of Korea' },
}
const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }

function readSource(src, caseRow) {
  if (src === 'customer_name_en') {
    const f = (caseRow.data.customer_first_name_en ?? '').trim()
    const l = (caseRow.data.customer_last_name_en ?? '').trim()
    if (f || l) return [f, l].filter(Boolean).join(' ')
    return caseRow.customer_name_en ?? caseRow.customer_name
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
  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'date_or_age') {
    if (typeof raw === 'string' && raw) return fmtDate(raw)
    return data.age ? String(data.age) : ''
  }
  if ((m = transform?.match(/^array\[(\d+)\](?:\.(\w+))?$/))) {
    const idx = +m[1], prop = m[2]
    if (source === 'rabies_dates') return fmtDate(sortedDesc(raw)[idx])
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
  if ((m = transform?.match(/^product\[(\d+)\]$/)) && source === 'rabies_dates') {
    const date = sortedDesc(raw)[+m[1]]; const p = date ? lookupRabies(date) : null
    if (!p) return ''
    const name = p.vaccine || p.product
    return name ? `${name} (${p.manufacturer})` : p.manufacturer
  }
  if ((m = transform?.match(/^period\[(\d+)\]$/)) && source === 'rabies_dates') {
    const date = sortedDesc(raw)[+m[1]]; return date && lookupRabies(date) ? '1' : ''
  }
  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDate(raw)
  return typeof raw === 'string' ? raw : String(raw)
}

const caseRow = {
  id: 't1', customer_name: 'Gildong Hong', customer_name_en: 'Gildong Hong',
  pet_name: 'Kongi', pet_name_en: 'Kongi', microchip: '410123456789012',
  destination: '일본',
  data: {
    address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    species: 'dog', breed_en: 'Maltese', color_en: 'White', sex: 'neutered_male',
    birth_date: '2020-03-15', microchip_implant_date: '2021-04-10',
    vet_visit_date: '2026-06-20',
    rabies_dates: [
      '2026-05-01', '2025-05-01', '2024-05-01', '2023-05-01',
    ],
    rabies_titer_records: [
      { date: '2026-04-15', value: '0.7', lab: 'apqa_seoul' },
      { date: '2025-05-01', value: '0.5', lab: 'krsl' },
    ],
  },
}

const form = mappings.FormAC
const pdf = await PDFDocument.load(await readFile(path.join('data/pdf-templates', form.template)))
pdf.registerFontkit(fontkit)
const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const pdfForm = pdf.getForm()
const filled = {}, missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = resolve(mp, caseRow)
  if (v !== '' && v !== false) filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFCheckBox') { if (v === true) f.check(); else f.uncheck() }
    else if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
  } catch { missing.push(name) }
}
pdfForm.updateFieldAppearances(font)
console.log('Filled:')
for (const [k, v] of Object.entries(filled)) console.log(`  ${k.padEnd(22)} = ${typeof v === 'string' && v.length > 45 ? v.slice(0, 45) + '…' : v}`)
if (missing.length) console.warn('MISSING:', missing)
await writeFile('data/pdf-analysis/formac_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/formac_test.pdf')
