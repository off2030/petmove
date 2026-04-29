// Option 2 검증: lib/pdf-fill.ts의 fillPdf를 직접 호출해서
// 결과 PDF의 AP 스트림 폰트 크기가 실제로 커졌는지 확인.
import {
  PDFDocument, PDFName, PDFDict, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream,
} from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'
import { fillPdf } from '../lib/pdf-fill.ts'

const sampleCase = {
  id: 'verify-1',
  customer_name: '홍길동',
  customer_name_en: 'Gildong Hong',
  pet_name: '콩이',
  pet_name_en: 'Kongi',
  microchip: '410123456789012',
  microchip_extra: [],
  destination: '일본',
  departure_date: null,
  org_id: 'x', created_at: '', updated_at: '',
  vet_visit_date: '2026-04-10',
  data: {
    phone: '01012345678',
    address_kr: '서울시 관악구 관악로 29길 3',
    address_en: '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    species: 'dog',
    breed_en: 'Maltese',
    color_en: 'White',
    sex: 'neutered_male',
    weight: '5',
    birth_date: '2020-03-15',
    microchip_implant_date: '2021-04-10',
    rabies_dates: ['2024-05-01', '2023-05-01', '2022-05-01'],
    general_vaccine_dates: ['2025-06-10'],
    external_parasite_dates: ['2026-04-01'],
    internal_parasite_dates: ['2026-04-01'],
  },
}

function extractAPFontSizes(pdf) {
  const out = []
  for (const f of pdf.getForm().getFields()) {
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
      if (m) out.push({ name, size: Number(m[1]) })
    }
  }
  return out
}

console.log('Generating Form25 via fillPdf()…')
const t0 = Date.now()
const result = await fillPdf('Form25', sampleCase)
const t1 = Date.now()
if (!result.ok) {
  console.error('fillPdf failed:', result.error)
  process.exit(1)
}
console.log(`  fillPdf took ${t1 - t0}ms, filename=${result.filename}`)

// Save and re-load
await writeFile('data/pdf-analysis/form25_verify.pdf', Buffer.from(result.pdf, 'base64'))
const pdf = await PDFDocument.load(Buffer.from(result.pdf, 'base64'))
const sizes = extractAPFontSizes(pdf)

const filled = sizes.filter(s => s.size > 0)
const dist = new Map()
for (const s of filled) dist.set(s.size, (dist.get(s.size) || 0) + 1)

console.log(`\n=== AP font sizes (Form25, ${filled.length} widgets with text) ===`)
const sorted = [...dist.entries()].sort((a, b) => b[0] - a[0])
console.log('  distribution:', sorted.map(([s, c]) => `${s}pt×${c}`).join(', '))
const avg = filled.reduce((a, b) => a + b.size, 0) / filled.length
console.log(`  mean size: ${avg.toFixed(2)}pt`)
const min = Math.min(...filled.map(s => s.size))
const max = Math.max(...filled.map(s => s.size))
console.log(`  min/max: ${min}pt / ${max}pt`)

console.log('\nsample fields:')
const interesting = ['owner_name', 'owner_address', 'owner_phone', 'pet_name', 'breed', 'rabies1_product', 'hospital_address1', 'age_years', 'microchip_number', 'birth_date', 'vet_name']
for (const name of interesting) {
  const found = sizes.find(s => s.name === name)
  if (found) console.log(`  ${name.padEnd(24)} ${found.size}pt`)
}
