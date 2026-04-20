// SGP smoke test — fills the new SGP.pdf using the updated mapping.
// Verifies all 36 fields resolve and produces data/pdf-analysis/sgp_test.pdf.
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

const VET_INFO = {
  name_en: 'Jinwon Lee',
  clinic_en: 'Lausanne Veterinary Medical Center',
  address_en: '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  phone_intl: '+82-2-872-7588',
  email: 'petmove@naver.com',
}
const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }
const PARASITE_INGRED = {
  frontline_plus_dog: 'Fipronil + (S)-Methoprene',
  frontline_spray_cat: 'Fipronil',
  drontal_plus_dog: 'Praziquantel + Pyrantel pamoate + Febantel',
  nexgard_spectra_dog: 'Afoxolaner + Milbemycin oxime',
  nexgard_cat_combo_cat: 'Esafoxolaner + Eprinomectin + Praziquantel',
}

function sortedDesc(d) {
  if (!Array.isArray(d)) return []
  return d.map(x => typeof x === 'string' ? x : x?.date).filter(s => typeof s === 'string' && s).slice().sort((a,b)=>b.localeCompare(a))
}
function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => typeof i === 'string' ? { date: i } : i).filter(r => r && r.date).slice().sort((a,b)=>b.date.localeCompare(a.date))
}
function lookupRabies(date) {
  if (!date) return null
  return vaccines.rabies.find(r => r.year === Number(date.slice(0,4))) ?? null
}
function lookupComp(species, date) {
  const list = vaccines[`comprehensive_${species}`] ?? []
  return list.filter(p => p.expiry && date <= p.expiry).sort((a,b)=>a.expiry<b.expiry?-1:1)[0] ?? null
}
function lookupExt(species, date) {
  const list = vaccines[`parasite_external_${species}`] ?? []
  return list[0] ?? null
}
function lookupInt(species, date) {
  const list = vaccines[`parasite_internal_${species}`] ?? []
  return list.length<=1 ? list[0] ?? null : list.filter(p => p.expiry && date <= p.expiry).sort((a,b)=>a.expiry<b.expiry?-1:1)[0] ?? null
}

function readSource(src, c) {
  const fromRow = c[src]
  return fromRow != null ? fromRow : c.data?.[src]
}

function resolve(mp, c) {
  const { source, transform } = mp
  const raw = source ? readSource(source, c) : null
  const data = c.data ?? {}
  let m

  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if ((m = transform?.match(/^vet:(.+)$/))) return VET_INFO[m[1]] ?? ''
  if ((m = transform?.match(/^checkbox:eq:(.+)$/))) return String(raw ?? '') === m[1]
  if ((m = transform?.match(/^vaccine_desc:(rabies|ext_parasite|int_parasite|comprehensive):(name|date)\[(\d+)\]$/))) {
    const kind = m[1], attr = m[2], idx = Number(m[3])
    const date = sortedDesc(raw)[idx]
    if (!date) return ''
    if (attr === 'date') return date.replace(/-/g,'/')
    const sp = String(data.species ?? '').toLowerCase()
    let p = null
    if (kind === 'rabies') p = lookupRabies(date)
    else if (kind === 'comprehensive' && (sp==='dog'||sp==='cat')) p = lookupComp(sp, date)
    else if (kind === 'ext_parasite' && (sp==='dog'||sp==='cat')) p = lookupExt(sp, date)
    else if (kind === 'int_parasite' && (sp==='dog'||sp==='cat')) p = lookupInt(sp, date)
    if (!p) return ''
    if (attr === 'name') return p.product || p.vaccine || ''
    return ''
  }
  if ((m = transform?.match(/^parasite_info:(external|internal):(ingredient|dose)\[(\d+)\]$/))) {
    const side = m[1], attr = m[2], idx = Number(m[3])
    const records = sortedDescRecords(raw)
    const rec = records[idx]
    if (!rec) return ''
    const sp = String(data.species ?? '').toLowerCase()
    const defaults = { external: { dog: 'frontline_plus_dog', cat: 'frontline_spray_cat' }, internal: { dog: 'drontal_plus_dog', cat: 'drontal_plus_cat' } }
    const pid = rec.product_id || defaults[side][sp]
    if (attr === 'ingredient') return PARASITE_INGRED[pid] ?? ''
    return ''
  }
  if ((m = transform?.match(/^array\[(\d+)\]\.(\w+)$/)) && source === 'rabies_titer_records') {
    const idx = Number(m[1]), prop = m[2]
    if (!Array.isArray(raw)) return ''
    const sorted = raw.slice().sort((a,b)=>(b.date??'').localeCompare(a.date??''))
    const rec = sorted[idx]
    if (!rec) return ''
    if (prop === 'date') return (rec.date ?? '').replace(/-/g,'/')
    if (prop === 'value') return rec.value ?? ''
    return ''
  }

  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g,'/')
    return raw
  }
  return String(raw)
}

const c = {
  id: 'sgp-test', org_id: '', created_at: '', updated_at: '',
  microchip: '900111222333444', microchip_extra: [],
  customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  pet_name: '코코', pet_name_en: 'Coco',
  destination: 'Singapore', departure_date: '2026-06-01',
  status: '진행중',
  vet_visit_date: '2026-04-15',
  data: {
    species: 'dog', breed_en: 'Maltese', color_en: 'White',
    sex: 'neutered_male', weight: '4.2', birth_date: '2020-03-15',
    rabies_dates: [{ date: '2025-09-14', valid_until: '2026-09-14' }],
    rabies_titer_records: [{ date: '2025-10-20', value: '16.8', lab: 'krsl' }],
    general_vaccine_dates: [{ date: '2025-08-10', valid_until: '2026-08-10' }],
    external_parasite_dates: [{ date: '2026-04-10', product_id: 'frontline_plus_dog' }],
    internal_parasite_dates: [{ date: '2026-04-10', product_id: 'drontal_plus_dog' }],
  },
}

const form = mappings.SGP
const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()

const toDmy = (s) => s.replace(/^(\d{4})[-/](\d{2})[-/](\d{2})$/, '$3/$2/$1')
const reformat = form.dateFormat === 'dmy' ? (s)=>typeof s==='string'?toDmy(s):s : (s)=>s

const filled = {}, empty = [], missing = []
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

// DA setup
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

console.log('=== SGP smoke test ===')
console.log(`mapped: ${mapFields.size} | template: ${tplFields.size} | filled: ${Object.keys(filled).length} | empty: ${empty.length}`)
if (inTplNotMap.length) console.warn('  ⚠ in template but NOT mapped:', inTplNotMap)
if (inMapNotTpl.length) console.warn('  ⚠ in mapping but NOT in template:', inMapNotTpl)
if (missing.length) console.warn('  ⚠ pdfForm.getField failed for:', missing)

console.log('\nkey values:')
const checks = [
  ['Species', 'text_3tcic'], ['Breed', 'text_4okuj'], ['Name', 'text_5wcle'],
  ['DOB', 'text_6vatu'], ['Colour', 'text_7nvqf'], ['Microchip', 'text_9qhaf'],
  ['SecIII Vet', 'text_11qfuf'], ['Country', 'text_12gljs'],
  ['Distemper', 'text_13vpdl'], ['Adeno1', 'text_14yyzu'], ['Parvo2', 'text_15ggyf'],
  ['Rabies', 'text_19jz'], ['BloodSamp', 'text_20olqh'], ['Titer', 'text_21irsk'],
  ['ExtParDate', 'text_22mqjk'], ['ExtParName', 'text_23ltyb'], ['ExtParIngr', 'text_24egtj'],
  ['IntParDate', 'text_25pv'], ['IntParName', 'text_26zheb'], ['IntParIngr', 'text_27lonm'],
  ['EndorseDate', 'text_28wkfi'], ['Practice', 'text_29ulae'], ['Address', 'text_30hspb'],
  ['Phone', 'text_31tz'], ['Email', 'text_32fjpy'],
]
for (const [label, k] of checks) {
  console.log(`  ${label.padEnd(13)} ${k.padEnd(18)} ${JSON.stringify(filled[k] ?? (empty.includes(k) ? '(empty)' : '?'))}`)
}

await writeFile('data/pdf-analysis/sgp_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/sgp_test.pdf')
