// CH smoke test — verifies all CH mapping fields resolve against the template.
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const form = mappings.CH

function readSource(src, c) {
  const data = c.data ?? {}
  if (src === 'postcode_place') {
    let zip = String(data.address_zipcode ?? '').trim()
    if (!zip) {
      const m = String(data.address_kr ?? '').match(/^\((\d{4,6})\)/)
      if (m) zip = m[1]
    }
    let city = String(data.address_city ?? '').trim()
    if (/^republic of korea$/i.test(city)) {
      const parts = String(data.address_en ?? '').split(',').map(s=>s.trim()).filter(Boolean)
      const cleaned = parts.length && /^republic of korea$/i.test(parts[parts.length-1]) ? parts.slice(0,-1) : parts
      const last = cleaned[cleaned.length-1] ?? ''
      const sl = cleaned[cleaned.length-2] ?? ''
      city = /-do$/i.test(last) && sl ? sl : last
    }
    return [zip, city].filter(Boolean).join(' ')
  }
  if (src === 'address_en_no_country') {
    const parts = String(data.address_en ?? '').split(',').map(s=>s.trim()).filter(Boolean)
    const cleaned = parts.length && /^republic of korea$/i.test(parts[parts.length-1]) ? parts.slice(0,-1) : parts
    return cleaned.join(', ')
  }
  const fromRow = c[src]
  return fromRow != null ? fromRow : data[src]
}

function resolve(mp, c) {
  const { source, transform } = mp
  const raw = source ? readSource(source, c) : null
  let m

  if (transform === 'checkbox:always_true') return true
  if (transform === 'today_ymd_slash') {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  }
  if ((m = transform?.match(/^checkbox:eq:(.+)$/))) return String(raw ?? '') === m[1]
  if ((m = transform?.match(/^checkbox:in:(.+)$/))) return m[1].split('|').includes(String(raw ?? ''))
  if ((m = transform?.match(/^json:(.+)$/))) {
    if (!raw || typeof raw !== 'object') return ''
    const v = raw[m[1]]
    return v == null ? '' : String(v)
  }
  if ((m = transform?.match(/^swiss_addr:(street|postcode_place|postcode|city)$/))) {
    const attr = m[1]
    const s = String(raw ?? '').trim()
    if (!s) return ''
    const segs = s.split(',').map(x=>x.trim()).filter(Boolean)
    const plzIdx = segs.findIndex(seg => /^\d{4}(\s|$)/.test(seg))
    if (plzIdx < 0) return attr === 'street' ? s : ''
    const mm = segs[plzIdx].match(/^(\d{4})\s*(.*)$/)
    const postcode = mm?.[1] ?? '', city = (mm?.[2] ?? '').trim()
    const street = segs.slice(0, plzIdx).join(', ')
    if (attr === 'street') return street
    if (attr === 'postcode') return postcode
    if (attr === 'city') return city
    return [postcode, city].filter(Boolean).join(' ')
  }
  if ((m = transform?.match(/^json_eq:([^:]+):(.+)$/))) {
    if (!raw || typeof raw !== 'object') return false
    return String(raw[m[1]] ?? '') === m[2]
  }
  if ((m = transform?.match(/^json_in:([^:]+):(.+)$/))) {
    if (!raw || typeof raw !== 'object') return false
    return m[2].split('|').includes(String(raw[m[1]] ?? ''))
  }
  if (transform === 'phone_intl_kr') {
    let s = String(raw ?? '').replace(/\D/g, '')
    if (s.startsWith('82')) s = s.slice(2)
    if (s.startsWith('0')) s = s.slice(1)
    if (!s) return ''
    const areaLen = s.startsWith('2') ? 1 : 2
    const area = s.slice(0, areaLen)
    const rest = s.slice(areaLen)
    if (!rest) return `+82-${area}`
    const tailLen = rest.length >= 7 ? 4 : 3
    if (rest.length <= tailLen) return `+82-${area}-${rest}`
    return `+82-${area}-${rest.slice(0, rest.length - tailLen)}-${rest.slice(-tailLen)}`
  }

  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
    }
    return raw
  }
  return String(raw)
}

const c = {
  id: 'ch-test', org_id: '', created_at: '', updated_at: '',
  microchip: '900111222333444',
  customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  customer_first_name_en: 'Gildong', customer_last_name_en: 'Hong',
  phone: '010-1234-5678',
  address_en: '25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea',
  pet_name: '코코', pet_name_en: 'Coco',
  destination: 'Switzerland', departure_date: '2026-06-01',
  vet_visit_date: '2026-04-15',
  species: 'dog',
  sex: 'neutered_male',
  data: {
    species: 'dog',
    breed_en: 'Maltese',
    color_en: 'White',
    sex: 'neutered_male',
    weight: '4.2',
    birth_date: '2020-03-15',
    address_zipcode: '06356',
    address_city: 'Seoul',
    address_en: '25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea',
    address_overseas: 'Rue du Lac 12, 1800 Vevey, Switzerland',
    switzerland_extra: {
      entry_purpose: 'relocation',
      entry_date: '2026-06-02',
      entry_airport: 'zurich',
      email: 'owner@example.com',
      cropped: 'no',
    },
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

const filled = {}
const empty = []
const missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = reformat(resolve(mp, c))
  if (v === '' || v === false) empty.push(name)
  else filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) f.setText(v)
    else if (f.constructor.name === 'PDFCheckBox') { v === true ? f.check() : f.uncheck() }
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

console.log('=== CH smoke test ===')
console.log(`mapped: ${mapFields.size} | template: ${tplFields.size} | filled: ${Object.keys(filled).length} | empty: ${empty.length}`)
if (inTplNotMap.length) console.warn('  ⚠ in template but NOT mapped:', inTplNotMap)
if (inMapNotTpl.length) console.warn('  ⚠ in mapping but NOT in template:', inMapNotTpl)
if (missing.length) console.warn('  ⚠ pdfForm.getField failed for:', missing)

console.log('\nfilled values:')
for (const [k, v] of Object.entries(filled)) {
  console.log(`  ${k.padEnd(20)} ${JSON.stringify(v)}`)
}
console.log('\nempty (unchecked boxes / unset text):', empty.join(', '))

await mkdir('data/pdf-analysis', { recursive: true })
await writeFile('data/pdf-analysis/ch_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/ch_test.pdf')
