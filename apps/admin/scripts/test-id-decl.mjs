import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const form = mappings.IdentificationDeclaration

// Simulate microchip with spaces to verify digit[n] stripping
const caseRow = {
  id: 'test-case',
  pet_name: '콩이',
  pet_name_en: 'Kongi',
  breed_en: 'Maltese, white, small',
  sex: 'neutered_male',
  birth_date: '2020-03-15',
  microchip: '410 123 456 789 012',
  data: {
    customer_first_name_en: 'John',
    customer_last_name_en: 'Smith',
  },
}

const b = await readFile(`data/pdf-templates/${form.template}`)
const pdf = await PDFDocument.load(b)
const pdfForm = pdf.getForm()

function resolve(mapping) {
  const src = mapping.source
  let raw = null
  if (src === 'customer_name_en') {
    raw = [caseRow.data.customer_first_name_en, caseRow.data.customer_last_name_en].filter(Boolean).join(' ')
  } else if (src) {
    raw = caseRow[src] ?? caseRow.data[src] ?? null
  }
  const t = mapping.transform
  if (t === 'checkbox:always_true') return true
  if (t?.startsWith('checkbox:eq:')) return String(raw) === t.slice('checkbox:eq:'.length)
  let m = t?.match(/^char\[(\d+)\]$/)
  if (m) return String(raw ?? '')[Number(m[1])] ?? ''
  m = t?.match(/^digit\[(\d+)\]$/)
  if (m) return String(raw ?? '').replace(/\D/g, '')[Number(m[1])] ?? ''
  if (t === 'date_dmy') {
    const x = String(raw ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return x ? `${x[3]}/${x[2]}/${x[1]}` : ''
  }
  return raw
}

for (const [fn, mp] of Object.entries(form.fields)) {
  const v = resolve(mp)
  try {
    const f = pdfForm.getField(fn)
    if (f.constructor.name === 'PDFCheckBox') {
      if (v === true) f.check(); else f.uncheck()
    } else if (f.constructor.name === 'PDFTextField' && typeof v === 'string' && v) {
      f.setText(v)
    }
  } catch {}
}

const sample = {
  birth_date: resolve(form.fields.birth_date),
  chip1_digits: Array.from({length:15}, (_,i)=>resolve(form.fields[`chip1_${String(i+1).padStart(2,'0')}`])).join(''),
}
console.log('birth_date:', sample.birth_date)
console.log('chip1 concat:', sample.chip1_digits, `(len=${sample.chip1_digits.length})`)

await writeFile('data/pdf-analysis/identification_test.pdf', await pdf.save())
console.log('Written.')
