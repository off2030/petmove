// Smoke test the 4 infectious-disease test application forms.
// Verifies every field in each mapping resolves to the correct template field.
import { PDFDocument, PDFName, PDFString, PDFDict, PDFTextField, PDFCheckBox } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const FORMS = ['APQA_HQ', 'APQA_HQ_En', 'KSVDL', 'VBDDL']

const SPECIES_EN = { dog: 'Dog', cat: 'Cat' }
const SEX_SIMPLE = { male: 'Male', female: 'Female', neutered_male: 'Male', spayed_female: 'Female' }
const SEX_KO = { male: '수', female: '암', neutered_male: '중성화수', spayed_female: '중성화암' }

function ageParts(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null
  const now = new Date(), by = +m[1], bm = +m[2]-1, bd = +m[3]
  let y = now.getFullYear() - by, mo = now.getMonth() - bm
  if (now.getDate() < bd) mo -= 1
  if (mo < 0) { y -= 1; mo += 12 }
  return y < 0 ? null : { years: y, months: mo }
}

function readSource(src, c) {
  const data = c.data ?? {}
  if (src === 'customer_name_en') {
    const fn = (data.customer_first_name_en ?? '').trim()
    const ln = (data.customer_last_name_en ?? '').trim()
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
    return c.customer_name_en ?? c.customer_name ?? ''
  }
  return c[src] != null ? c[src] : data[src]
}

function resolve(mp, c) {
  const { source, transform } = mp
  const raw = source ? readSource(source, c) : null
  let m
  if (transform === 'today_ymd_slash') { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}` }
  if ((m = transform?.match(/^today_part:(day|month|year|be_year)$/))) {
    const d = new Date()
    if (m[1]==='day') return String(d.getDate()).padStart(2,'0')
    if (m[1]==='month') return String(d.getMonth()+1).padStart(2,'0')
    if (m[1]==='year') return String(d.getFullYear())
    return String(d.getFullYear()+543)
  }
  if (transform === 'phone_intl_kr') {
    let s = String(raw ?? '').replace(/\D/g,''); if (s.startsWith('82')) s = s.slice(2); if (s.startsWith('0')) s = s.slice(1)
    if (!s) return ''
    const a = s.startsWith('2')?1:2, area = s.slice(0,a), rest = s.slice(a)
    const t = rest.length>=7?4:3
    return rest.length<=t?`+82-${area}-${rest}`:`+82-${area}-${rest.slice(0,rest.length-t)}-${rest.slice(-t)}`
  }
  if (transform === 'en' && source === 'species') return SPECIES_EN[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'sex_simple_en') return SEX_SIMPLE[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'sex_label_ko') return SEX_KO[String(raw ?? '').toLowerCase()] ?? ''
  if (transform === 'date_mdy_compact') {
    const mm = String(raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return mm ? `${mm[2]}${mm[3]}${mm[1]}` : ''
  }
  if (transform === 'age_ko') {
    const a = ageParts(raw); return !a ? '' : (a.years === 0 ? `${a.months}개월` : `${a.years}살`)
  }
  if (transform === 'checkbox:always_true') return true
  if (transform === 'address_part:street') {
    const s = String(raw ?? '').trim(); if (!s) return ''
    const segs = s.split(',').map(x=>x.trim()).filter(Boolean)
    if (segs.length <= 1) return s
    return segs.slice(0, Math.max(1, segs.length - 3)).join(', ')
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
  id: 't', customer_name: '홍길동', customer_name_en: 'Gildong Hong',
  customer_first_name_en: 'Gildong', customer_last_name_en: 'Hong',
  phone: '010-1234-5678',
  address_kr: '서울시 관악구 관악로 29길 3',
  address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  microchip: '900111222333444',
  pet_name: '코코', pet_name_en: 'Coco',
  destination: 'New Zealand',
  vet_visit_date: '2026-04-15',
  data: {
    species: 'dog', breed_en: 'Maltese', color_en: 'White',
    sex: 'neutered_male', weight: '4.2', birth_date: '2020-03-15',
    address_zipcode: '08826', address_city: 'Seoul',
  },
}

for (const key of FORMS) {
  const form = mappings[key]
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
      if (f instanceof PDFTextField && typeof v === 'string' && v) f.setText(v)
      else if (f instanceof PDFCheckBox) { v === true ? f.check() : f.uncheck() }
    } catch { missing.push(name) }
  }
  const tplFields = new Set(pdfForm.getFields().map(f => f.getName()))
  const mapFields = new Set(Object.keys(form.fields))
  const inTplNotMap = [...tplFields].filter(x => !mapFields.has(x))
  const inMapNotTpl = [...mapFields].filter(x => !tplFields.has(x))

  console.log(`=== ${key} === mapped ${mapFields.size}/${tplFields.size}, filled ${Object.keys(filled).length}, empty ${empty.length}`)
  if (inTplNotMap.length) console.warn('  ⚠ template but NOT mapped:', inTplNotMap)
  if (inMapNotTpl.length) console.warn('  ⚠ mapping but NOT in template:', inMapNotTpl)
  if (missing.length) console.warn('  ⚠ getField failed:', missing)
  for (const [k, v] of Object.entries(filled)) console.log('   ', k.padEnd(20), JSON.stringify(v))

  const fontName = 'NanumGothic'
  const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
  let dr = acro.lookup(PDFName.of('DR')); if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
  let drFonts = dr.lookup(PDFName.of('Font')); if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
  drFonts.set(PDFName.of(fontName), customFont.ref)
  const da = PDFString.of(`/${fontName} 0 Tf 0 g`)
  for (const f of pdfForm.getFields()) {
    if (!(f instanceof PDFTextField)) continue
    f.acroField.dict.set(PDFName.of('DA'), da)
    for (const w of f.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da)
  }
  pdfForm.updateFieldAppearances(customFont)

  await mkdir('data/pdf-analysis', { recursive: true })
  await writeFile(`data/pdf-analysis/${key}_test.pdf`, await pdf.save())
  console.log()
}
