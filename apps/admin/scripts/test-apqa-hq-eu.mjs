// APQA_HQ_EU smoke test — fills the template with a sample case and writes
// data/pdf-analysis/apqa_hq_eu_test.pdf for visual inspection.
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const form = mappings.APQA_HQ_EU
if (!form) throw new Error('APQA_HQ_EU mapping not found')

const VET = {
  name_ko: '이진원',
  clinic_ko: '로잔동물병원',
  address_ko: '서울특별시 강남구 도산대로 123',
  phone: '02-1234-5678',
  mobile_phone: '010-1234-5678',
}

const caseRow = {
  id: 'eu-test',
  customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  pet_name: '콩이',
  pet_name_en: 'Kongi',
  microchip: '410123456789012',
  destination: '독일',
  data: {
    species: 'dog',
    breed: '말티즈',
    breed_en: 'Maltese',
    sex: 'neutered_male',
    birth_date: '2020-03-15',
    vet_visit_date: '2025-12-11',
    rabies_titer_records: [
      { date: '2025-12-08', value: '5.0', lab: 'apqa_eu' },
    ],
  },
}

function fmtDateYmdSlash(s) {
  if (typeof s !== 'string') return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : s
}

function readSource(src) {
  if (!src) return null
  if (src in caseRow) return caseRow[src]
  if (src in caseRow.data) return caseRow.data[src]
  // titer_date:<lab>
  const titer = src.match(/^titer_date:(.+)$/)
  if (titer) {
    const lab = titer[1]
    const recs = caseRow.data.rabies_titer_records ?? []
    const matched = recs
      .filter(r => r.lab === lab && r.date)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return matched[0]?.date ?? caseRow.data.vet_visit_date ?? '2025-12-11'
  }
  return null
}

function todayYMDSlash() {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function resolve(mp) {
  const { source, transform, default: def } = mp
  const raw = source ? readSource(source) : null
  const data = caseRow.data
  if (transform === 'vet:name_ko') return VET.name_ko
  if (transform === 'vet:clinic_ko') return VET.clinic_ko
  if (transform === 'vet:address_ko') return VET.address_ko
  if (transform === 'vet:phone') return VET.phone
  if (transform === 'today_ymd_slash') return todayYMDSlash()
  let m
  if ((m = transform?.match(/^today_part:(year|month|day)$/))) {
    const d = new Date()
    if (m[1] === 'year') return String(d.getFullYear())
    if (m[1] === 'month') return String(d.getMonth() + 1).padStart(2, '0')
    return String(d.getDate()).padStart(2, '0')
  }
  if ((m = transform?.match(/^date_part:(year|month|day)$/))) {
    const s = String(raw ?? '')
    const dm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!dm) return ''
    return m[1] === 'year' ? dm[1] : m[1] === 'month' ? dm[2] : dm[3]
  }
  if (transform === 'species_breed_ko' || transform === 'species_breed_count_ko') {
    const sp = String(data.species ?? '').toLowerCase()
    const speciesKo = sp === 'dog' ? '개' : sp === 'cat' ? '고양이' : ''
    const breed = String(raw ?? '').trim()
    const head = speciesKo && breed ? `${speciesKo}(${breed})` : speciesKo || breed
    return transform === 'species_breed_count_ko' ? `${head} 1두`.trim() : head
  }
  if (raw == null || raw === '') return def ?? ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return fmtDateYmdSlash(raw)
  return String(raw)
}

const tpl = await readFile(path.join('data/pdf-templates', form.template))
const pdf = await PDFDocument.load(tpl)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const customFont = await pdf.embedFont(fontBytes, { subset: false })
const pdfForm = pdf.getForm()

const filled = {}
const empty = []
const missing = []
for (const [name, mp] of Object.entries(form.fields)) {
  const v = resolve(mp)
  if (v === '' || v == null) { empty.push(name); continue }
  filled[name] = v
  try {
    const f = pdfForm.getField(name)
    if (f instanceof PDFCheckBox) {
      if (v === true) f.check(); else f.uncheck()
    } else if (f instanceof PDFTextField && typeof v === 'string') {
      f.setText(v)
    }
  } catch { missing.push(name) }
}

pdfForm.updateFieldAppearances(customFont)

console.log('filled:')
for (const [k, v] of Object.entries(filled)) console.log(`  ${k.padEnd(14)} = ${v}`)
console.log(`\nempty: ${empty.length}  missing in PDF: ${missing.length}`)
if (missing.length) console.warn('missing:', missing)

await mkdir('data/pdf-analysis', { recursive: true })
await writeFile('data/pdf-analysis/apqa_hq_eu_test.pdf', await pdf.save())
console.log('\nWritten: data/pdf-analysis/apqa_hq_eu_test.pdf')
