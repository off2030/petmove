// Standalone Form25 smoke test mirroring lib/pdf-fill.ts transforms.
import { PDFDocument, PDFName, PDFBool, PDFString, PDFDict, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function lookupRabies(date) {
  if (!date) return null
  const y = Number(date.slice(0, 4))
  return vaccines.rabies.find(r => r.year === y) ?? null
}
function lookupByDateRange(list, date) {
  if (!date) return null
  const c = list
    .filter(p => p.expiry && date <= p.expiry)
    .sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
  return c[0] ?? null
}
function lookupExt(species, date) {
  const list = species === 'dog' ? vaccines.parasite_external_dog : vaccines.parasite_external_cat
  if (list.length <= 1) return list[0] ?? null
  return lookupByDateRange(list, date)
}
function lookupInt(species, date) {
  const list = species === 'dog' ? vaccines.parasite_internal_dog : vaccines.parasite_internal_cat
  if (list.length <= 1) return list[0] ?? null
  return lookupByDateRange(list, date)
}
function lookupComprehensive(species, date) {
  const list = species === 'dog' ? vaccines.comprehensive_dog : vaccines.comprehensive_cat
  return lookupByDateRange(list, date)
}

const PARASITE_FAMILIES = [
  { id: 'frontline_plus_dog',  name: 'Frontline Plus',  manufacturer: 'Boehringer Ingelheim', species: 'dog', kind: 'external' },
  { id: 'frontline_spray_cat', name: 'Frontline Spray', manufacturer: 'Boehringer Ingelheim', species: 'cat', kind: 'external' },
  { id: 'drontal_plus_dog',    name: 'Drontal Plus',    manufacturer: 'Bayer',                species: 'dog', kind: 'internal' },
  { id: 'drontal_plus_cat',    name: 'Drontal Plus',    manufacturer: 'Bayer',                species: 'cat', kind: 'internal' },
  { id: 'nexgard_spectra_dog',  name: 'NexGard Spectra',   manufacturer: 'Boehringer Ingelheim', species: 'dog', kind: 'combo' },
  { id: 'nexgard_cat_combo_cat', name: 'NexGard Cat Combo', manufacturer: 'Boehringer Ingelheim', species: 'cat', kind: 'combo' },
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
    const c = matches.filter(p => p.expiry && ctx.date <= p.expiry).sort((a,b)=>a.expiry<b.expiry?-1:1)
    pick = c[0] ?? matches[0]
  } else pick = matches[0]
  return { product: pick?.product ?? fam.name, manufacturer: pick?.manufacturer ?? fam.manufacturer, batch: pick?.batch ?? null, expiry: pick?.expiry ?? null }
}

function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => typeof i === 'string' ? { date: i } : i).filter(r => r && r.date).slice().sort((a,b)=>b.date.localeCompare(a.date))
}

function buildOtherVaccineSequence(data) {
  // Mirror lib/pdf-fill.ts ordering: 종합 → CIV → 켄넬코프 → 외부 → 내부 → 심장사상충.
  // No allowedVaccines filter — Form25 must always include any data the case has.
  const species = String(data.species ?? '').toLowerCase()
  const has = species === 'dog' || species === 'cat'
  const weightKg = Number(String(data.weight ?? '').replace(/[^\d.]/g, '')) || 0
  const out = []
  const blank = (type, date) => ({ type, name: '', manufacturer: '', serial: '', date: fmtDate(date) })

  const gv = sortedDesc(data.general_vaccine_dates)[0]
  if (gv) {
    const p = has ? lookupComprehensive(species, gv) : null
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(gv) })
  }
  const civ = sortedDesc(data.civ_dates)[0]
  if (civ) {
    const p = vaccines.civ.filter(x => x.expiry && civ <= x.expiry).sort((a,b) => a.expiry < b.expiry ? -1 : 1)[0] ?? null
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(civ) })
  }
  const kc = sortedDesc(data.kennel_cough_dates)[0]
  if (kc) {
    const p = vaccines.kennel_cough[0] ?? null
    out.push({ type: 'Vaccination', name: p?.vaccine || p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(kc) })
  }
  const buildParasite = (rec, side) => {
    if (rec.product_id) {
      const p = lookupParasiteById(rec.product_id, { date: rec.date, weightKg })
      return { type: 'Parasiticide', name: p?.product || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) }
    }
    const p = has ? (side === 'external' ? lookupExt(species, rec.date) : lookupInt(species, rec.date)) : null
    return { type: 'Parasiticide', name: p?.product || p?.vaccine || '', manufacturer: p?.manufacturer ?? '', serial: p?.batch ?? '', date: fmtDate(rec.date) }
  }
  const seen = new Set()
  const dedupKey = (rec) => rec.product_id && getParasiteFamily(rec.product_id)?.kind === 'combo' ? `${rec.product_id}@${rec.date}` : null
  const ext = sortedDescRecords(data.external_parasite_dates)[0]
  if (ext) { const k = dedupKey(ext); if (k) seen.add(k); out.push(buildParasite(ext, 'external')) }
  const int = sortedDescRecords(data.internal_parasite_dates)[0]
  if (int) { const k = dedupKey(int); if (!(k && seen.has(k))) out.push(buildParasite(int, 'internal')) }
  const hw = sortedDescRecords(data.heartworm_dates)[0]
  if (hw) out.push(blank('Parasiticide', hw.date))
  return out
}

function sortedDesc(dates) {
  if (!Array.isArray(dates)) return []
  return dates
    .map(d => (typeof d === 'string' ? d : d?.date))
    .filter(d => typeof d === 'string' && !!d)
    .slice()
    .sort((a, b) => b.localeCompare(a))
}
function sortedAsc(dates) { return sortedDesc(dates).slice().reverse() }
function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }
function fmtDateDMY(s) {
  if (typeof s !== 'string') return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function ageParts(b) {
  if (typeof b !== 'string') return null
  const m = b.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const by = +m[1], bm = +m[2] - 1, bd = +m[3], now = new Date()
  let y = now.getFullYear() - by, mo = now.getMonth() - bm
  if (now.getDate() < bd) mo -= 1
  if (mo < 0) { y -= 1; mo += 12 }
  return y < 0 ? null : { years: y, months: mo }
}
function fmtPhoneDash(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
  return s
}
function todaySlash() {
  const d = new Date()
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}/${mm}/${dd}`
}

function readSource(src, caseRow) {
  if (src === 'customer_name_en') {
    const f = (caseRow.data.customer_first_name_en ?? '').trim()
    const l = (caseRow.data.customer_last_name_en ?? '').trim()
    if (f || l) return [f, l].filter(Boolean).join(' ')
    return caseRow.customer_name_en ?? caseRow.customer_name
  }
  const fromRow = caseRow[src]
  const v = fromRow != null ? fromRow : caseRow.data?.[src]
  return v
}

function resolve(mapping, caseRow) {
  const { source, transform } = mapping
  const raw = source ? readSource(source, caseRow) : null
  const data = caseRow.data ?? {}

  if (transform === 'checkbox:always_true') return true
  if (transform === 'checkbox:male') { const s = String(raw ?? ''); return s === 'male' || s === 'neutered_male' }
  if (transform === 'checkbox:female') { const s = String(raw ?? ''); return s === 'female' || s === 'spayed_female' }
  let m
  if ((m = transform?.match(/^checkbox:eq:(.+)$/))) return String(raw ?? '') === m[1]
  if ((m = transform?.match(/^char\[(\d+)\]$/))) return String(raw ?? '')[+m[1]] ?? ''
  if ((m = transform?.match(/^digit\[(\d+)\]$/))) return String(raw ?? '').replace(/\D/g, '')[+m[1]] ?? ''
  if (transform === 'date_dmy') return fmtDateDMY(raw)
  if (transform === 'age_years') { const a = ageParts(raw); return a ? String(a.years) : '' }
  if (transform === 'age_months') { const a = ageParts(raw); return a ? String(a.months) : '' }
  if ((m = transform?.match(/^cmp:num:(lt|le|gt|ge|eq|between|gt_lt):(.+)$/))) {
    const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''))
    if (!Number.isFinite(n)) return false
    const op = m[1]
    const a = m[2].split(':').map(Number)
    if (op === 'lt') return n < a[0]
    if (op === 'le') return n <= a[0]
    if (op === 'gt') return n > a[0]
    if (op === 'ge') return n >= a[0]
    if (op === 'eq') return n === a[0]
    if (op === 'between') return n >= a[0] && n < a[1]
    if (op === 'gt_lt') return n > a[0] && n < a[1]
    return false
  }
  if (transform === 'phone_dash') return fmtPhoneDash(raw)
  if (transform === 'today_ymd_slash') return todaySlash()
  if (transform === 'checkbox:truthy') return !!(raw != null && raw !== '')
  if (transform === 'checkbox:falsy') return !(raw != null && raw !== '')
  if ((m = transform?.match(/^has\[(\d+)\]$/))) return !!sortedAsc(raw)[+m[1]]
  if ((m = transform?.match(/^other_vacc_seq:(type|name|manufacturer|serial|date)\[(\d+)\]$/))) {
    const entry = buildOtherVaccineSequence(data)[+m[2]]
    return entry ? entry[m[1]] : ''
  }
  if ((m = transform?.match(/^vaccine:(rabies|ext_parasite|int_parasite):(name|manufacturer|serial|date)\[(\d+)\]$/))) {
    const kind = m[1], attr = m[2], n = +m[3]
    const date = sortedAsc(raw)[n]
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
  if (source === null) return mapping.default ?? ''
  if (raw == null || raw === '') return mapping.default ?? ''
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDate(raw)
    return raw
  }
  return String(raw)
}

const caseRow = {
  id: 't1',
  customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  pet_name: '콩이',
  pet_name_en: 'Kongi',
  microchip: '410123456789012',
  microchip_extra: [],
  destination: '호주',
  departure_date: null,
  org_id: 'x', created_at: '', updated_at: '',
  data: {
    phone: '01012345678',
    address_kr: '서울시 관악구 관악로 29길 3',
    address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    species: 'dog',
    breed: '말티즈',
    breed_en: 'Maltese',
    color: '흰색',
    color_en: 'White',
    sex: 'neutered_male',
    weight: '5',
    birth_date: '2020-03-15',
    microchip_implant_date: '2021-04-10',
    rabies_dates: ['2024-05-01', '2023-05-01', '2022-05-01'],
    general_vaccine_dates: ['2025-06-10', '2024-06-10'],
    external_parasite_dates: ['2026-04-01'],
    internal_parasite_dates: ['2026-04-01'],
  },
}

// Scenario comparison helper — show sequence output for data variants.
function dumpSeq(label, dataOverride) {
  const seq = buildOtherVaccineSequence({ ...caseRow.data, ...dataOverride })
  console.log(`\n[${label}]`)
  seq.forEach((e, i) => console.log(`  slot${i + 1}: ${e.type} · ${e.name || '(no product)'} · serial=${e.serial || '-'} · ${e.date}`))
  if (seq.length < 3) console.log(`  slot${seq.length + 1}..3: (empty)`)
}
dumpSeq('All 6 categories (must show in fixed order, no destination filter)', {
  destination: '일본',
  general_vaccine_dates: ['2025-06-10'],
  civ_dates: ['2025-07-15'],
  kennel_cough_dates: ['2025-08-20'],
  external_parasite_dates: ['2026-04-01'],
  internal_parasite_dates: ['2026-04-02'],
  heartworm_dates: ['2026-04-03'],
})
dumpSeq('Default external+internal (date lookup)', {})
dumpSeq('NexGard combo (dog) — same entry on both sides', {
  species: 'dog', weight: '5',
  external_parasite_dates: [{ date: '2026-04-22', product_id: 'nexgard_spectra_dog' }],
  internal_parasite_dates: [{ date: '2026-04-22', product_id: 'nexgard_spectra_dog' }],
})
dumpSeq('NexGard Combo (cat)', {
  species: 'cat', weight: '4',
  external_parasite_dates: [{ date: '2026-04-22', product_id: 'nexgard_cat_combo_cat' }],
  internal_parasite_dates: [{ date: '2026-04-22', product_id: 'nexgard_cat_combo_cat' }],
})
dumpSeq('External-only (Frontline) for cat', {
  species: 'cat',
  external_parasite_dates: [{ date: '2026-05-01', product_id: 'frontline_spray_cat' }],
  internal_parasite_dates: [],
})
dumpSeq('Mixed: Frontline external + NexGard later (overrides internal)', {
  species: 'dog', weight: '5',
  external_parasite_dates: [
    { date: '2026-04-22', product_id: 'frontline_plus_dog' },
    { date: '2026-05-10', product_id: 'nexgard_spectra_dog' },
  ],
  internal_parasite_dates: [
    { date: '2026-05-10', product_id: 'nexgard_spectra_dog' },
  ],
})

const form = mappings.Form25
const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()
const filled = {}, empty = [], missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = resolve(mp, caseRow)
  if (v === '' || v === false) empty.push(name)
  else filled[name] = v
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
// Mirror pdf-fill.ts: compute per-field max size, set DA, then generate AP.
// Flip MAXIMIZE to false to simulate the rollback path.
const MAXIMIZE = process.env.ROLLBACK ? false : true
const fontName = 'NanumGothic'

// Inject NanumGothic into AcroForm /DR.Font
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
  const c = Math.max(MIN, Math.min(MAX, minSize))
  return Math.floor(c * 2) / 2
}

if (MAXIMIZE) {
  for (const field of pdfForm.getFields()) {
    if (field.constructor.name !== 'PDFTextField') continue
    const tf = field
    const text = tf.getText() ?? ''
    const size = computeMaxFontSize(tf, text, customFont)
    const da = PDFString.of(`/${fontName} ${size} Tf 0 g`)
    field.acroField.dict.set(PDFName.of('DA'), da)
    for (const w of field.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da)
  }
  pdfForm.updateFieldAppearances(customFont)
} else {
  pdfForm.updateFieldAppearances(customFont)
  const zero = PDFString.of(`/${fontName} 0 Tf 0 g`)
  for (const field of pdfForm.getFields()) {
    if (field.constructor.name !== 'PDFTextField') continue
    field.acroField.dict.set(PDFName.of('DA'), zero)
  }
}

console.log('filled:', filled)
console.log('empty count:', empty.length)
if (missing.length) console.warn('missing:', missing)

// Inspect AP sizes
const apSizes = []
for (const f of pdfForm.getFields()) {
  if (f.constructor.name !== 'PDFTextField') continue
  const name = f.getName()
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
    const m = contents.match(/\/\S+\s+(-?\d*\.?\d+)\s+Tf/)
    if (m) apSizes.push({ name, size: Number(m[1]) })
  }
}
const dist = new Map()
for (const s of apSizes) dist.set(s.size, (dist.get(s.size) || 0) + 1)
const sorted = [...dist.entries()].sort((a, b) => b[0] - a[0])
console.log(`\nAP font size distribution (MAXIMIZE=${MAXIMIZE}):`)
console.log(' ', sorted.map(([s, c]) => `${s}pt×${c}`).join(', '))
const mean = apSizes.reduce((a, b) => a + b.size, 0) / apSizes.length
console.log(` mean=${mean.toFixed(2)}pt  min=${Math.min(...apSizes.map(s=>s.size))}  max=${Math.max(...apSizes.map(s=>s.size))}`)
console.log('\nsample fields:')
for (const n of ['owner_name','owner_address','owner_phone','pet_name','breed','rabies1_product','hospital_address1','age_years','microchip_number','birth_date','vet_name']) {
  const f = apSizes.find(s => s.name === n)
  if (f) console.log(`  ${n.padEnd(22)} ${f.size}pt`)
}

await writeFile('data/pdf-analysis/form25_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/form25_test.pdf')
