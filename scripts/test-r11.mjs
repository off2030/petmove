import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const form = mappings.FormR11

const SEX_SIMPLE = { male: 'Male', female: 'Female', neutered_male: 'Male', spayed_female: 'Female' }

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
  let m

  if (transform === 'today_ymd_slash') {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
  }
  if ((m = transform?.match(/^today_part:(day|month|year|be_year)$/))) {
    const d = new Date()
    if (m[1] === 'day') return String(d.getDate()).padStart(2, '0')
    if (m[1] === 'month') return String(d.getMonth()+1).padStart(2, '0')
    if (m[1] === 'year') return String(d.getFullYear())
    if (m[1] === 'be_year') return String(d.getFullYear() + 543)
  }
  if (transform === 'phone_intl_kr') {
    let s = String(raw ?? '').replace(/\D/g, '')
    if (s.startsWith('82')) s = s.slice(2)
    if (s.startsWith('0')) s = s.slice(1)
    if (!s) return ''
    const areaLen = s.startsWith('2') ? 1 : 2
    const area = s.slice(0, areaLen), rest = s.slice(areaLen)
    if (!rest) return `+82-${area}`
    const tailLen = rest.length >= 7 ? 4 : 3
    return rest.length <= tailLen ? `+82-${area}-${rest}` : `+82-${area}-${rest.slice(0, rest.length - tailLen)}-${rest.slice(-tailLen)}`
  }
  if (transform === 'sex_simple_en') return SEX_SIMPLE[String(raw ?? '').toLowerCase()] ?? ''
  if ((m = transform?.match(/^json:(.+)$/))) {
    if (!raw || typeof raw !== 'object') return ''
    const v = raw[m[1]]
    return v == null ? '' : String(v)
  }
  if ((m = transform?.match(/^kr_addr:(no|street|city|state|country|postcode)$/))) {
    const data = c.data ?? {}
    const attr = m[1]
    if (attr === 'country') return 'Republic of Korea'
    if (attr === 'postcode') return String(data.address_zipcode ?? '').trim()
    const s = String(raw ?? '').trim()
    if (!s) return ''
    const all = s.split(',').map(x => x.trim()).filter(Boolean)
    const parts = all.length && /^republic of korea$/i.test(all[all.length-1]) ? all.slice(0,-1) : all
    if (parts.length === 0) return ''
    const SPECIAL = /^(seoul|busan|incheon|daegu|daejeon|gwangju|ulsan|sejong)$/i
    const last = parts[parts.length-1]
    const hasState = /-do$/i.test(last) || SPECIAL.test(last)
    const state = hasState ? last : ''
    const afterState = hasState ? parts.slice(0,-1) : parts
    const city = afterState.length >= 2 ? afterState[afterState.length-1] : (afterState[afterState.length-1] ?? '')
    const streetParts = afterState.length >= 2 ? afterState.slice(0,-1) : []
    let no = '', street = ''
    const numOnly = /^\d+(-\d+)?$/
    if (streetParts.length === 1) {
      const mm = streetParts[0].match(/^(\S+)\s+(.+)$/)
      if (mm) { no = mm[1]; street = mm[2] } else { street = streetParts[0] }
    } else if (streetParts.length >= 2) {
      if (numOnly.test(streetParts[0])) {
        no = streetParts[0]; street = streetParts.slice(1).join(', ')
      } else {
        const mm = streetParts[0].match(/^(\S+)\s+(.+)$/)
        if (mm) { no = mm[1]; street = [mm[2], ...streetParts.slice(1)].join(', ') }
        else { street = streetParts.join(', ') }
      }
    }
    if (attr === 'no') return no
    if (attr === 'street') return street
    if (attr === 'city') return city
    if (attr === 'state') return state
    return ''
  }

  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
    return raw
  }
  return String(raw)
}

const c = {
  id: 'r11-test', customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  customer_first_name_en: 'Gildong', customer_last_name_en: 'Hong',
  phone: '010-1234-5678',
  microchip: '900111222333444',
  destination: 'Thailand', departure_date: '2026-06-01',
  address_en: '25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea',
  vet_visit_date: '2026-04-15',
  data: {
    species: 'dog', breed_en: 'Maltese', color_en: 'White',
    sex: 'neutered_male', weight: '4.2', birth_date: '2020-03-15',
    address_en: '25 Irwon-ro 14-gil, Gangnam-gu, Seoul, Republic of Korea',
    address_zipcode: '06356',
    thailand_extra: {
      address_overseas: '88/17 Rama IV Rd, Silom, Bangkok 10500, Thailand',
      passport_number: 'M12345678',
      passport_expiry_date: '2030-05-20',
      passport_issuer: 'Ministry of Foreign Affairs',
      arrival_flight_number: 'KE659',
      arrival_date: '2026-06-02',
      arrival_time: '22:30',
      quarantine_location: 'Bangkok',
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

console.log('=== FormR11 smoke test ===')
console.log(`mapped: ${mapFields.size} | template: ${tplFields.size} | filled: ${Object.keys(filled).length} | empty: ${empty.length}`)
if (inTplNotMap.length) console.warn('  ⚠ in template but NOT mapped:', inTplNotMap)
if (inMapNotTpl.length) console.warn('  ⚠ in mapping but NOT in template:', inMapNotTpl)
if (missing.length) console.warn('  ⚠ pdfForm.getField failed for:', missing)

console.log('\nfilled values:')
for (const [k, v] of Object.entries(filled)) console.log(`  ${k.padEnd(20)} ${JSON.stringify(v)}`)
console.log('\nempty:', empty.join(', '))

await mkdir('data/pdf-analysis', { recursive: true })
await writeFile('data/pdf-analysis/r11_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/r11_test.pdf')
