import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))
const form = mappings.VHC

const VET_INFO = {
  name_en: 'Jinwon Lee',
  clinic_en: 'Lausanne Veterinary Medical Center',
  address_en: '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  phone_intl: '+82-2-872-7588',
  license_no: '9608',
}
const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }
const SEX_SIMPLE = { male: 'Male', female: 'Female', neutered_male: 'Male', spayed_female: 'Female' }

function sortedDesc(d) {
  if (!Array.isArray(d)) return []
  return d.map(x => typeof x === 'string' ? x : x?.date).filter(s => typeof s === 'string').slice().sort((a, b) => b.localeCompare(a))
}
function lookupRabies(date) { if (!date) return null; return vaccines.rabies.find(r => r.year === Number(date.slice(0, 4))) ?? null }
function lookupComp(sp, date) { const list = vaccines[`comprehensive_${sp}`] ?? []; return list.filter(p => p.expiry && date <= p.expiry).sort((a, b) => a.expiry < b.expiry ? -1 : 1)[0] ?? null }
function lookupCiv(date) { const list = vaccines.civ_dog ?? []; return list.filter(p => p.expiry && date <= p.expiry).sort((a, b) => a.expiry < b.expiry ? -1 : 1)[0] ?? list[0] ?? null }
function lookupExt(sp) { const list = vaccines[`parasite_external_${sp}`] ?? []; return list[0] ?? null }
function lookupInt(sp) { const list = vaccines[`parasite_internal_${sp}`] ?? []; return list[0] ?? null }

function readSource(src, c) {
  const data = c.data ?? {}
  if (src === 'customer_name_en') {
    const first = ((data.customer_first_name_en ?? '') + '').trim()
    const last = ((data.customer_last_name_en ?? '') + '').trim()
    if (first || last) return [first, last].filter(Boolean).join(' ')
    return c.customer_name_en ?? c.customer_name ?? ''
  }
  const fromRow = c[src]
  return fromRow != null ? fromRow : data[src]
}

function resolve(mp, c) {
  const { source, transform } = mp
  const raw = source ? readSource(source, c) : null
  const data = c.data ?? {}
  let m

  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'sex_simple_en') return SEX_SIMPLE[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'today_ymd_slash') {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  }
  if (transform === 'phone_intl_kr') {
    let s = String(raw ?? '').replace(/\D/g, '')
    if (s.startsWith('82')) s = s.slice(2)
    if (s.startsWith('0')) s = s.slice(1)
    if (!s) return ''
    const areaLen = s.startsWith('2') ? 1 : 2
    return `+82-${s.slice(0, areaLen)}-${s.slice(areaLen, -4)}-${s.slice(-4)}`
  }
  if ((m = transform?.match(/^vet:(.+)$/))) return VET_INFO[m[1]] ?? ''
  if ((m = transform?.match(/^label_if:([a-z_]+):(.+)$/))) {
    const KIND = { rabies: 'rabies_dates', general: 'general_vaccine_dates', comprehensive: 'general_vaccine_dates', civ: 'civ_dates', kennel: 'kennel_cough_dates', heartworm: 'heartworm_dates', ext_parasite: 'external_parasite_dates', int_parasite: 'internal_parasite_dates' }
    const key = KIND[m[1]]
    if (!key) return ''
    const v = data[key]
    if (!Array.isArray(v) || v.length === 0) return ''
    const label = m[2]
    const pipe = label.indexOf('|')
    if (pipe >= 0) {
      const dog = label.slice(0, pipe), cat = label.slice(pipe + 1)
      return String(data.species ?? '').toLowerCase() === 'cat' ? cat : dog
    }
    return label
  }
  if ((m = transform?.match(/^vaccine_desc:(rabies|ext_parasite|int_parasite|civ|comprehensive):(name|manufacturer|serial|date|validity_from|validity_to)\[(\d+)\]$/))) {
    const kind = m[1], attr = m[2], idx = Number(m[3])
    const date = sortedDesc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return date.replace(/-/g, '/')
    if ((kind === 'civ' || kind === 'comprehensive' || kind === 'rabies') && attr === 'validity_to') {
      const mm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!mm) return ''
      return `${Number(mm[1]) + 1}/${mm[2]}/${mm[3]}`
    }
    const sp = String(data.species ?? '').toLowerCase()
    let p = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'civ') p = lookupCiv(date)
    else if (kind === 'comprehensive' && (sp === 'dog' || sp === 'cat')) p = lookupComp(sp, date)
    else if (kind === 'ext_parasite' && (sp === 'dog' || sp === 'cat')) p = lookupExt(sp, date)
    else if (kind === 'int_parasite' && (sp === 'dog' || sp === 'cat')) p = lookupInt(sp, date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    return ''
  }
  if ((m = transform?.match(/^array\[(\d+)\]\.(\w+)$/)) && source === 'rabies_titer_records') {
    const idx = Number(m[1]), prop = m[2]
    if (!Array.isArray(raw)) return ''
    const sorted = raw.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const rec = sorted[idx]
    if (!rec) return ''
    if (prop === 'date') return (rec.date ?? '').replace(/-/g, '/')
    if (prop === 'value') return rec.value ?? ''
    if (prop === 'lab') return rec.lab ?? ''
    return ''
  }

  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '/')
    return raw
  }
  return String(raw)
}

const c = {
  id: 'vhc-test',
  customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  customer_first_name_en: 'Gildong', customer_last_name_en: 'Hong',
  phone: '010-1234-5678',
  address_en: '25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea',
  microchip: '900111222333444',
  destination: 'Indonesia',
  vet_visit_date: '2026-04-15',
  data: {
    species: "dog", breed_en: 'Maltese', color_en: 'White',
    sex: 'neutered_male', weight: '4.2', birth_date: '2020-03-15',
    microchip_implant_date: '2020-05-01',
    rabies_dates: [{ date: '2025-09-14' }],
    rabies_titer_records: [{ date: '2025-10-20', value: '16.8', lab: 'krsl' }],
    general_vaccine_dates: [{ date: '2025-08-10' }],
    external_parasite_dates: [{ date: '2026-04-10', product_id: 'frontline_plus_dog' }],
    internal_parasite_dates: [{ date: '2026-04-10', product_id: 'drontal_plus_dog' }],
  },
}

const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()

const toDmy = (s) => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
const reformat = form.dateFormat === 'dmy' ? (s) => typeof s === 'string' ? toDmy(s) : s : (s) => s

const filled = {}, empty = [], missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = reformat(resolve(mp, c))
  if (v === '' || v === false) empty.push(name)
  else filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
  } catch { missing.push(name) }
}

const fontName = 'NanumGothic'
const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
let dr = acro.lookup(PDFName.of('DR'))
if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
let drFonts = dr.lookup(PDFName.of('Font'))
if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
drFonts.set(PDFName.of(fontName), customFont.ref)
const da = PDFString.of(`/${fontName} 0 Tf 0 g`)
for (const f of pdfForm.getFields()) {
  if (f.constructor.name !== 'PDFTextField') continue
  f.acroField.dict.set(PDFName.of('DA'), da)
  for (const w of f.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da)
}
pdfForm.updateFieldAppearances(customFont)

const tplFields = new Set(pdfForm.getFields().map(f => f.getName()))
const mapFields = new Set(Object.keys(form.fields))
const inTplNotMap = [...tplFields].filter(x => !mapFields.has(x))
const inMapNotTpl = [...mapFields].filter(x => !tplFields.has(x))

console.log('=== VHC smoke test ===')
console.log(`mapped: ${mapFields.size} | template: ${tplFields.size} | filled: ${Object.keys(filled).length} | empty: ${empty.length}`)
if (inTplNotMap.length) console.warn('  ⚠ in template but NOT mapped:', inTplNotMap)
if (inMapNotTpl.length) console.warn('  ⚠ in mapping but NOT in template:', inMapNotTpl)
if (missing.length) console.warn('  ⚠ pdfForm.getField failed for:', missing)

console.log('\nfilled values:')
for (const [k, v] of Object.entries(filled)) console.log(`  ${k.padEnd(22)} ${JSON.stringify(v)}`)

await mkdir('data/pdf-analysis', { recursive: true })
await writeFile('data/pdf-analysis/vhc_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/vhc_test.pdf')
