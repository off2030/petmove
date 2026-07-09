// TK smoke test — fills TK.pdf with the new mapping and a realistic 터키 case.
// Verifies field placement + value plumbing. Writes data/pdf-analysis/tk_test.pdf.
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }
const SEX_LABEL_EN = { male: 'Male', female: 'Female', neutered_male: 'N. male', spayed_female: 'N. female' }

function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => typeof i === 'string' ? { date: i } : i).filter(r => r && r.date).slice().sort((a, b) => b.date.localeCompare(a.date))
}
function sortedAscRecords(arr) { return sortedDescRecords(arr).slice().reverse() }
function lookupRabies(date) {
  if (!date) return null
  return vaccines.rabies?.find(r => r.year === Number(date.slice(0, 4))) ?? null
}
const fmtDate = (s) => (typeof s === 'string' ? s.replace(/-/g, '/') : '')
function addYear(d, n) {
  const m = d.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/); if (!m) return ''
  return `${Number(m[1]) + n}/${m[2]}/${m[3]}`
}

function readSource(src, c) { const v = c[src]; return v != null ? v : c.data?.[src] }

function resolve(mp, c) {
  const { source, transform } = mp
  const raw = source ? readSource(source, c) : null
  let m
  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'sex_label') return SEX_LABEL_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'vaccine_combined:rabies:name') {
    const recs = sortedAscRecords(raw)
    const names = recs.map(r => r.product?.trim() || lookupRabies(r.date)?.product || lookupRabies(r.date)?.vaccine || '').filter(Boolean)
    return [...new Set(names)].join(' / ')
  }
  if ((m = transform?.match(/^vaccine_desc:rabies:(serial|date|validity_to)\[(\d+)\]$/))) {
    const attr = m[1], idx = Number(m[2])
    const rec = sortedDescRecords(raw)[idx]; if (!rec?.date) return ''
    if (attr === 'date') return fmtDate(rec.date)
    if (attr === 'validity_to') return rec.valid_until && /^\d{4}/.test(rec.valid_until) ? fmtDate(rec.valid_until) : addYear(rec.date, 1)
    if (attr === 'serial') return rec.lot?.trim() || lookupRabies(rec.date)?.batch || ''
  }
  if ((m = transform?.match(/^array\[(\d+)\]\.(\w+)$/)) && source === 'rabies_titer_records') {
    const rec = sortedDescRecords(raw)[Number(m[1])]; if (!rec) return ''
    if (m[2] === 'date') return fmtDate(rec.date)
    if (m[2] === 'value') return rec.value ?? ''
  }
  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  if (typeof raw === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fmtDate(raw) : raw
  return String(raw)
}

const c = {
  id: 'tk-test', customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  microchip: '900111222333444', pet_name_en: 'Coco',
  destination: '터키', departure_date: '2026-08-01', vet_visit_date: '2026-07-31',
  address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  address_overseas: 'Bagdat Cad. No:123, Kadikoy, Istanbul, Turkey',
  data: {
    species: 'dog', breed_en: 'Maltese', sex: 'neutered_male', birth_date: '2020-03-15',
    rabies_dates: [
      { date: '2024-09-14', valid_until: '2025-09-14', product: 'Rabisin', lot: 'L123' },
      { date: '2025-09-10', valid_until: '2026-09-10', product: 'Rabisin', lot: 'L456' },
    ],
    rabies_titer_records: [{ date: '2025-10-20', value: '16.8', lab: 'krsl' }],
  },
}

const form = mappings.TK
const pdf = await PDFDocument.load(await readFile(path.join('data/pdf-templates', form.template)))
pdf.registerFontkit(fontkit)
const customFont = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const pdfForm = pdf.getForm()
const toDmy = (s) => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
const reformat = form.dateFormat === 'dmy' ? (s) => typeof s === 'string' ? s.split(' / ').map(toDmy).join(' / ') : s : (s) => s

const filled = {}, empty = [], missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = reformat(resolve(mp, c))
  if (v === '' || v === false) empty.push(name); else filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
  } catch { missing.push(name) }
}

const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
let dr = acro.lookup(PDFName.of('DR')); if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
let drFonts = dr.lookup(PDFName.of('Font')); if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
drFonts.set(PDFName.of('NanumGothic'), customFont.ref)
const da = PDFString.of('/NanumGothic 0 Tf 0 g')
for (const f of pdfForm.getFields()) { if (f.constructor.name !== 'PDFTextField') continue; f.acroField.dict.set(PDFName.of('DA'), da); for (const w of f.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da) }
pdfForm.updateFieldAppearances(customFont)

const tplFields = new Set(pdfForm.getFields().map(f => f.getName()))
const mapFields = new Set(Object.keys(form.fields))
console.log('=== TK smoke test ===')
console.log(`mapped: ${mapFields.size} | template: ${tplFields.size} | filled: ${Object.keys(filled).length} | empty: ${empty.length}`)
const inTplNotMap = [...tplFields].filter(x => !mapFields.has(x))
const inMapNotTpl = [...mapFields].filter(x => !tplFields.has(x))
if (inTplNotMap.length) console.warn('  ⚠ in template but NOT mapped:', inTplNotMap)
if (inMapNotTpl.length) console.warn('  ⚠ in mapping but NOT in template:', inMapNotTpl)
if (missing.length) console.warn('  ⚠ getField failed:', missing)
console.log('\nkey values:')
for (const [label, k] of [
  ['Origin', 'text_1hpqx'], ['Dispatch', 'text_3xyve'], ['Loading', 'text_4qrwb'],
  ['Consignor', 'text_5pdah'], ['Consignor addr', 'text_6epwu'], ['Consignee', 'text_10ploi'], ['Consignee addr', 'text_12gwyq'],
  ['Species', 'text_14ibfi'], ['Breed', 'text_18xspx'], ['Sex', 'text_22khgf'], ['DOB', 'text_26durx'], ['Microchip', 'text_30fjuk'],
  ['Rabies product', 'rabies_product'], ['Batch', 'text_37rji'], ['Vacc date', 'text_38ktmy'], ['Valid until', 'text_39quav'],
  ['Titer date', 'text_36mpqj'],
]) console.log(`  ${label.padEnd(15)} ${k.padEnd(15)} ${JSON.stringify(filled[k] ?? (empty.includes(k) ? '(empty)' : '?'))}`)

await writeFile('data/pdf-analysis/tk_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/tk_test.pdf')
