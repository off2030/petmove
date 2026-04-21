// OVD (NZ Official Veterinarian Declaration) smoke test.
// Mirrors the OVD-specific transforms from lib/pdf-fill.ts to fill the template
// with a sample case and write the result for visual verification.
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function sortedDesc(dates) {
  if (!Array.isArray(dates)) return []
  return dates
    .map(d => typeof d === 'string' ? d : d?.date)
    .filter(d => typeof d === 'string' && !!d)
    .slice()
    .sort((a, b) => b.localeCompare(a))
}
function sortedAsc(d) { return sortedDesc(d).slice().reverse() }
function sortedTiters(rs) {
  if (!Array.isArray(rs)) return []
  return rs
    .filter(r => r && r.date)
    .slice()
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
function lookupRabies(date) {
  if (!date) return null
  const y = Number(date.slice(0, 4))
  return vaccines.rabies.find(r => r.year === y) ?? null
}
function readSource(src, c) {
  const fromRow = c[src]
  const v = fromRow != null ? fromRow : c.data?.[src]
  return v
}

function resolve(mapping, c) {
  const { source, transform } = mapping
  const raw = source ? readSource(source, c) : null
  let m

  // today_ymd_slash
  if (transform === 'today_ymd_slash') {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  }

  // digit[N]
  if ((m = transform?.match(/^digit\[(\d+)\]$/))) {
    const s = String(raw ?? '').replace(/\D/g, '')
    return s[Number(m[1])] ?? ''
  }

  // date_part:(day|month|year)
  if ((m = transform?.match(/^date_part:(day|month|year)$/))) {
    const s = typeof raw === 'string' ? raw : ''
    const dm = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
    if (!dm) return ''
    if (m[1] === 'year') return dm[1]
    if (m[1] === 'month') return dm[2].padStart(2, '0')
    return dm[3].padStart(2, '0')
  }

  // titer_part[N]:...
  if ((m = transform?.match(/^titer_part\[(\d+)\]:(date_(?:day|month|year)|value_(?:b[0-2]|a[01]))$/)) && source === 'rabies_titer_records') {
    const idx = Number(m[1]), key = m[2]
    const rec = sortedTiters(raw)[idx]
    if (!rec) return ''
    if (key.startsWith('date_')) {
      const dm = (rec.date ?? '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
      if (!dm) return ''
      if (key === 'date_year') return dm[1]
      if (key === 'date_month') return dm[2].padStart(2, '0')
      return dm[3].padStart(2, '0')
    }
    const num = Number(String(rec.value ?? '').replace(/[^\d.]/g, ''))
    if (!Number.isFinite(num)) return ''
    const [b, a] = num.toFixed(2).split('.')
    const p = b.padStart(3, ' ')
    if (key === 'value_b0') return p[0]?.trim() ?? ''
    if (key === 'value_b1') return p[1]?.trim() ?? ''
    if (key === 'value_b2') return p[2] ?? ''
    if (key === 'value_a0') return a[0] ?? ''
    if (key === 'value_a1') return a[1] ?? ''
    return ''
  }

  // ovd_vacc[N]:...
  if ((m = transform?.match(/^ovd_vacc\[(\d+)\]:(date_(?:day|month|year)|batch|expiry_(?:day|month|year)|doi_1y|doi_2y|doi_3y)$/)) && source === 'rabies_dates') {
    const idx = Number(m[1]), attr = m[2]
    const asc = sortedAsc(raw)
    const recent2 = asc.length >= 2 ? asc.slice(-2) : asc
    const date = recent2[idx]
    const isCheckbox = attr.startsWith('doi_')
    if (!date) return isCheckbox ? false : ''
    if (attr === 'doi_1y') return true
    if (attr === 'doi_2y' || attr === 'doi_3y') return false
    if (attr.startsWith('date_') || attr.startsWith('expiry_')) {
      const target = attr.startsWith('date_') ? date : (lookupRabies(date)?.expiry ?? '')
      const dm = target.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
      if (!dm) return ''
      const part = attr.split('_')[1]
      if (part === 'year') return dm[1]
      if (part === 'month') return dm[2].padStart(2, '0')
      return dm[3].padStart(2, '0')
    }
    if (attr === 'batch') return lookupRabies(date)?.batch ?? ''
    return ''
  }

  // passthrough
  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '/')
    return raw
  }
  return String(raw)
}

const c = {
  id: 'ovd-test',
  microchip: '900111222333444',
  microchip_extra: [],
  customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  pet_name: '코코',
  pet_name_en: 'Coco',
  destination: 'New Zealand',
  departure_date: '2026-06-01',
  status: '진행중',
  org_id: '', created_at: '', updated_at: '',
  vet_visit_date: '2026-04-15',
  data: {
    species: 'dog',
    breed_en: 'Maltese',
    sex: 'neutered_male',
    weight: '4.2',
    birth_date: '2020-03-15',
    microchip_implant_date: '2020-05-10',
    rabies_dates: ['2024-07-03', '2025-09-14'],
    rabies_titer_records: [
      { date: '2025-10-20', value: '16.8', lab: 'komipharm' },
    ],
  },
}

const form = mappings.OVD
const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()

const toDmy = (s) => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
const reformatDate = form.dateFormat === 'dmy' ? (s) => typeof s === 'string' ? toDmy(s) : s : (s) => s

const filled = {}, empty = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = reformatDate(resolve(mp, c))
  if (v === '' || v === false) empty.push(name)
  else filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
    else if (f.constructor.name === 'PDFCheckBox') { if (v === true) f.check(); else f.uncheck() }
  } catch (e) {
    console.warn('  missing field:', name)
  }
}

// DA / DR setup
const fontName = 'NanumGothic'
const fontRef = customFont.ref
const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
let dr = acro.lookup(PDFName.of('DR'))
if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
let drFonts = dr.lookup(PDFName.of('Font'))
if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
drFonts.set(PDFName.of(fontName), fontRef)
const da = PDFString.of(`/${fontName} 0 Tf 0 g`)
for (const field of pdfForm.getFields()) {
  if (field.constructor.name !== 'PDFTextField') continue
  field.acroField.dict.set(PDFName.of('DA'), da)
  for (const w of field.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da)
}
pdfForm.updateFieldAppearances(customFont)

console.log('\n=== OVD smoke test ===')
console.log('filled:', Object.keys(filled).length, '/ total:', Object.keys(form.fields).length)
console.log('empty:', empty.length, empty.length <= 3 ? empty : '')
console.log('\nkey values:')
const keyChecks = [
  ['text_1barn', 'RegVet Date'],
  ['text_53wspu', 'chip[0]'],
  ['text_39cgqq', 'chip[14]'],
  ['text_6cjms', 'implant D'],
  ['text_7norq', 'implant M'],
  ['text_8esbt', 'implant Y'],
  ['text_11uvn', 'titer D'],
  ['text_38axmr', 'titer_b0'],
  ['text_37bkse', 'titer_b1'],
  ['text_36aefb', 'titer_b2'],
  ['text_35jmhg', 'titer_a0'],
  ['text_34oqam', 'titer_a1'],
  ['text_12puyn', 'Vacc1 D'],
  ['text_13byis', 'Vacc1 M'],
  ['text_14eblq', 'Vacc1 Y'],
  ['text_25aish', 'Vacc1 Batch'],
  ['text_28fxpz', 'Vacc1 ExpD'],
  ['text_32bokc', 'Vacc1 ExpY'],
  ['text_15vsaw', 'Vacc2 D'],
  ['text_17oay', 'Vacc2 Y'],
  ['text_27ssea', 'Vacc2 Batch'],
  ['checkbox_18aaad', 'V1 doi_1y'],
  ['checkbox_20dsiy', 'V1 doi_2y'],
  ['checkbox_19qpqb', 'V2 doi_1y'],
]
for (const [k, label] of keyChecks) {
  console.log(`  ${label.padEnd(14)} ${k.padEnd(18)} ${JSON.stringify(filled[k] ?? (empty.includes(k) ? '(empty)' : '?'))}`)
}

await writeFile('data/pdf-analysis/ovd_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/ovd_test.pdf')
