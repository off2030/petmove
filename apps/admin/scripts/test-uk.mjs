// Annex III 채움 테스트 — lib/pdf-fill.ts의 로직을 복제.
import { PDFDocument, PDFName, PDFString, PDFDict, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

const LAB_INFO = {
  krsl:        { name: 'Komipharm Rabies Serology Laboratory', country: 'Republic of Korea' },
  apqa_seoul:  { name: 'APQA Seoul Office', country: 'Republic of Korea' },
  ksvdl_r:     { name: 'Kansas State Rabies Laboratory', country: 'United States of America' },
}

function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }
function fmtPhoneDash(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 11) return `${s.slice(0,3)}-${s.slice(3,7)}-${s.slice(7)}`
  if (s.length === 10) return `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}`
  return s
}
function sortedDesc(dates) {
  if (!Array.isArray(dates)) return []
  return dates.map(d => typeof d === 'string' ? d : d?.date).filter(d => typeof d === 'string' && !!d).slice().sort((a,b) => b.localeCompare(a))
}
function sortedAsc(d) { return sortedDesc(d).slice().reverse() }
function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => typeof i === 'string' ? { date: i } : i).filter(r => r && r.date).slice().sort((a,b) => b.date.localeCompare(a.date))
}
function sortedTiters(rs) {
  if (!Array.isArray(rs)) return []
  return rs.filter(r => r && r.date).slice().sort((a,b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
function lookupRabies(date) {
  if (!date) return null
  const y = Number(date.slice(0, 4))
  const r = vaccines.rabies.find(r => r.year === y)
  if (!r) return null
  // Add 1 year for validity
  const d = new Date(date); d.setFullYear(d.getFullYear() + 1)
  const to = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { ...r, validityFrom: date, validityTo: to }
}
function lookupByRange(list, date) {
  if (!date) return null
  return list.filter(p => p.expiry && date <= p.expiry).sort((a,b) => a.expiry < b.expiry ? -1 : 1)[0] ?? null
}
function lookupInt(sp, date) {
  const list = vaccines[`parasite_internal_${sp}`] ?? []
  return list.length <= 1 ? list[0] ?? null : lookupByRange(list, date)
}
const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }
const SEX_LABEL_EN = { male: 'Male', female: 'Female', neutered_male: 'N. male', spayed_female: 'N. female' }

function readSource(src, caseRow) {
  if (src === 'customer_name_en') {
    const f = (caseRow.data.customer_first_name_en ?? '').trim()
    const l = (caseRow.data.customer_last_name_en ?? '').trim()
    if (f || l) return [f, l].filter(Boolean).join(' ')
    return caseRow.customer_name_en ?? caseRow.customer_name
  }
  const EN_FALLBACK = { address_en: 'address_kr', address_overseas: 'address_kr' }
  const fromRow = caseRow[src]
  const v = fromRow != null ? fromRow : caseRow.data?.[src]
  if (v != null && v !== '') return v
  const fb = EN_FALLBACK[src]
  if (fb) return caseRow.data?.[fb]
  return v
}

function resolve(mapping, caseRow) {
  const { source, transform } = mapping
  const raw = source ? readSource(source, caseRow) : null
  const data = caseRow.data ?? {}
  let m

  if (transform === 'phone_dash') return fmtPhoneDash(raw)
  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'sex_label') return SEX_LABEL_EN[String(raw ?? '').toLowerCase()] ?? ''
  if ((m = transform?.match(/^address_part:(street|locality)$/))) {
    const part = m[1]
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!s) return ''
    const segs = s.split(',').map(x => x.trim()).filter(Boolean)
    if (segs.length <= 1) return part === 'street' ? s : ''
    const sc = Math.max(1, segs.length - 3)
    if (part === 'street') return segs.slice(0, sc).join(', ')
    return segs.slice(sc).join(', ')
  }

  if ((m = transform?.match(/^vaccine:(rabies|ext_parasite|int_parasite):(name|manufacturer|serial|date|validity_from|validity_to)\[(\d+)\]$/))) {
    const kind = m[1], attr = m[2], idx = Number(m[3])
    const date = sortedAsc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return fmtDate(date)
    let p = null
    if (kind === 'rabies') p = lookupRabies(date)
    if (!p) return ''
    if (attr === 'name') return p.vaccine || p.product || ''
    if (attr === 'manufacturer') return p.manufacturer ?? ''
    if (attr === 'serial') return p.batch ?? ''
    if (attr === 'validity_from') return fmtDate(p.validityFrom ?? '')
    if (attr === 'validity_to') return fmtDate(p.validityTo ?? '')
    return ''
  }

  if ((m = transform?.match(/^vacc_row_field:(transponder|implant)\[(\d+)\]$/))) {
    const attr = m[1], idx = Number(m[2])
    const rabies = sortedAsc(data.rabies_dates)
    if (!rabies[idx]) return ''
    if (attr === 'transponder') return String(raw ?? '')
    if (attr === 'implant') return typeof data.microchip_implant_date === 'string' ? fmtDate(data.microchip_implant_date) : ''
    return ''
  }
  if ((m = transform?.match(/^titer_date_asc\[(\d+)\]$/)) && source === 'rabies_titer_records') {
    const idx = Number(m[1])
    const asc = sortedTiters(raw).slice().reverse()
    return asc[idx] ? fmtDate(asc[idx].date) : ''
  }
  if ((m = transform?.match(/^annex_parasite:(transponder|product|date|vet)\[(\d+)\]$/))) {
    const TAPEWORM = ['영국', '아일랜드', '몰타', '북아일랜드', '노르웨이', '핀란드']
    const dest = caseRow.destination ?? ''
    const required = typeof dest === 'string' && dest.split(',').map(s => s.trim()).some(d => TAPEWORM.includes(d))
    if (!required) return ''
    const attr = m[1], idx = Number(m[2])
    const records = sortedDescRecords(data.internal_parasite_dates).slice().reverse()
    const rec = records[idx]
    if (!rec) return ''
    const mc = caseRow.microchip
    const sp = String(data.species ?? '').toLowerCase()
    if (attr === 'transponder') return typeof mc === 'string' ? mc : ''
    if (attr === 'date') return fmtDate(rec.date)
    if (attr === 'vet') return 'Jinwon Lee'
    if (attr === 'product') {
      if (sp === 'dog' || sp === 'cat') {
        const p = lookupInt(sp, rec.date)
        return p?.product || p?.vaccine || ''
      }
      return ''
    }
    return ''
  }
  if ((m = transform?.match(/^array\[(\d+)\]$/))) {
    const idx = Number(m[1])
    if (Array.isArray(raw)) return raw[idx] == null ? '' : String(raw[idx])
    return ''
  }

  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDate(raw)
    return raw
  }
  return String(raw)
}

const DEST_OVERRIDE = process.env.DEST  // e.g. DEST=영국 to test tapeworm destinations
const caseRow = {
  id: 'annex-test',
  customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  pet_name: '콩이',
  pet_name_en: 'Kongi',
  microchip: '410100012271380',
  microchip_extra: ['900123456789012'],
  destination: DEST_OVERRIDE || '유럽연합',
  departure_date: '2026-05-15',
  status: '진행중',
  org_id: 'x', created_at: '', updated_at: '',
  vet_visit_date: '2026-04-20',
  data: {
    phone: '01012345678',
    address_kr: '서울시 관악구 관악로 29길 3',
    address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    address_overseas: '10 Berlin Strasse, 10115 Berlin, Germany',
    species: 'dog',
    breed_en: 'Maltese',
    color_en: 'White',
    sex: 'neutered_male',
    weight: '5',
    birth_date: '2020-03-15',
    microchip_implant_date: '2021-04-10',
    rabies_dates: ['2024-05-01', '2025-05-01', '2026-04-10'],
    rabies_titer_records: [
      { date: '2024-06-01', value: '2.5', lab: 'krsl' },
    ],
    internal_parasite_dates: [
      { date: '2026-04-15', product_id: 'drontal_plus_dog' },
    ],
  },
}

// Fill mappings
const form = mappings.UK
const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()

const toDmy = (s) => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
const reformatDate = form.dateFormat === 'dmy' ? (s) => (typeof s === 'string' ? toDmy(s) : s) : (s) => s

const filled = {}, empty = [], missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = reformatDate(resolve(mp, caseRow))
  if (v === '' || v === false) empty.push(name)
  else filled[name] = typeof v === 'string' && v.length > 40 ? v.slice(0,40)+'…' : v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
  } catch {
    missing.push(name)
  }
}

// Apply MAXIMIZE font sizing (same as pdf-fill.ts)
const fontName = 'NanumGothic'
const fontRef = customFont.ref
const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
let dr = acro.lookup(PDFName.of('DR'))
if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
let drFonts = dr.lookup(PDFName.of('Font'))
if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
drFonts.set(PDFName.of(fontName), fontRef)

function computeMaxFontSize(tf, text, font) {
  if (!text) return 0
  const widgets = tf.acroField.getWidgets()
  if (widgets.length === 0) return 0
  const isMultiline = tf.isMultiline()
  const HORIZ_PAD = 2, VERT_PAD = 0.5, HEIGHT_MULT = 0.9, MIN = 5, MAX = 24
  let minSize = Infinity
  for (const w of widgets) {
    const r = w.getRectangle()
    const availW = Math.max(1, r.width - 2 * HORIZ_PAD)
    const availH = Math.max(1, r.height - 2 * VERT_PAD)
    const w1 = font.widthOfTextAtSize(text, 1)
    let widthLimit = w1 > 0.001 ? availW / w1 : MAX
    let heightLimit
    if (isMultiline) {
      heightLimit = Math.min(availH * HEIGHT_MULT, MAX)
      let s = heightLimit
      for (let i = 0; i < 8; i++) {
        const tw = w1 * s
        const lines = Math.max(1, Math.ceil(tw / availW))
        const need = lines * s * 1.2
        if (need <= availH) break
        s *= (availH / need) * 0.98
      }
      widthLimit = s; heightLimit = s
    } else {
      heightLimit = availH * HEIGHT_MULT
    }
    const sz = Math.min(heightLimit, widthLimit)
    if (sz < minSize) minSize = sz
  }
  return Math.floor(Math.max(MIN, Math.min(MAX, minSize)) * 2) / 2
}

for (const field of pdfForm.getFields()) {
  if (field.constructor.name !== 'PDFTextField') continue
  const text = field.getText() ?? ''
  const size = computeMaxFontSize(field, text, customFont)
  const da = PDFString.of(`/${fontName} ${size} Tf 0 g`)
  field.acroField.dict.set(PDFName.of('DA'), da)
  for (const w of field.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da)
}
pdfForm.updateFieldAppearances(customFont)

console.log('destination:', caseRow.destination)
console.log('filled fields:', Object.keys(filled).length)
const showKeys = ['I1_consignor_address','I1_consignor_address2','I5_consignee_address','I5_consignee_address2','decl_owner_name','decl_transponder1','decl_transponder2','decl_place_date','decl_signature','vet_date','vet_qualification']
console.log('\nkey fields:')
for (const k of showKeys) console.log(`  ${k.padEnd(32)} ${filled[k] === undefined ? '(empty)' : JSON.stringify(filled[k])}`)
const parasiteKeys = Object.keys(filled).filter(k => k.startsWith('parasite_row'))
console.log(`\nparasite rows filled (${parasiteKeys.length})`)
console.log('empty count:', empty.length)
if (missing.length) console.warn('MISSING fields:', missing)
else console.log('\nno missing fields ✓')

await writeFile('data/pdf-analysis/uk_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/uk_test.pdf')

// Quick AP size check
const apSizes = []
for (const f of pdfForm.getFields()) {
  if (f.constructor.name !== 'PDFTextField') continue
  for (const w of f.acroField.getWidgets()) {
    const ap = w.dict.lookup(PDFName.of('AP'))
    if (!(ap instanceof PDFDict)) continue
    const n = ap.get(PDFName.of('N'))
    let stream = n instanceof PDFRef ? pdf.context.lookup(n) : n
    if (!(stream instanceof PDFStream) && !(stream instanceof PDFRawStream)) continue
    let raw
    try {
      if (stream instanceof PDFRawStream) raw = decodePDFRawStream(stream).decode()
      else if (typeof stream.getUnencodedContents === 'function') raw = stream.getUnencodedContents()
      else raw = stream.getContents()
    } catch { continue }
    const contents = new TextDecoder('latin1').decode(raw)
    const match = contents.match(/\/\S+\s+(-?\d*\.?\d+)\s+Tf/)
    if (match) apSizes.push({ name: f.getName(), size: Number(match[1]) })
  }
}
if (apSizes.length) {
  const mean = apSizes.reduce((a,b) => a+b.size, 0) / apSizes.length
  console.log(`\nAP font sizes: mean=${mean.toFixed(2)}pt, min=${Math.min(...apSizes.map(s=>s.size))}, max=${Math.max(...apSizes.map(s=>s.size))}`)
}
