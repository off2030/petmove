// Form25 인쇄 불가 원인 진단.
// 1) 템플릿의 AcroForm 구조(DR, NeedAppearances 등)
// 2) 채우기 후 결과 PDF의 구조
// 3) 인쇄 관련 주요 플래그
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFBool, PDFString } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'

async function diag(label, bytes) {
  const pdf = await PDFDocument.load(bytes)
  const cat = pdf.catalog
  const acro = cat.lookup(PDFName.of('AcroForm'))
  console.log(`\n=== ${label} ===`)
  console.log(`  size: ${bytes.length} bytes`)
  console.log(`  pages: ${pdf.getPageCount()}`)
  if (!(acro instanceof PDFDict)) {
    console.log('  AcroForm: NONE')
    return
  }
  const needApp = acro.lookup(PDFName.of('NeedAppearances'))
  const dr = acro.lookup(PDFName.of('DR'))
  const sigFlags = acro.lookup(PDFName.of('SigFlags'))
  const xfa = acro.lookup(PDFName.of('XFA'))
  const fields = acro.lookup(PDFName.of('Fields'))
  console.log(`  NeedAppearances: ${needApp instanceof PDFBool ? needApp.asBoolean() : 'not set'}`)
  console.log(`  SigFlags: ${sigFlags ? sigFlags.toString() : 'none'}`)
  console.log(`  XFA: ${xfa ? 'PRESENT (legacy XFA form!)' : 'no'}`)
  console.log(`  Fields count: ${fields instanceof PDFArray ? fields.size() : '?'}`)
  if (dr instanceof PDFDict) {
    const fonts = dr.lookup(PDFName.of('Font'))
    if (fonts instanceof PDFDict) {
      const names = fonts.keys().map(k => k.toString())
      console.log(`  DR fonts: ${names.join(', ')}`)
    }
  } else {
    console.log('  DR: missing')
  }
  // Check permissions / encryption
  // pdf-lib exposes encryption info via raw catalog Encrypt
  const encrypt = pdf.context.trailerInfo.Encrypt
  console.log(`  Encrypted: ${encrypt ? 'YES' : 'no'}`)
  // Sample first 3 text fields' DA and appearance
  const form = pdf.getForm()
  const textFields = form.getFields().filter(f => f.constructor.name === 'PDFTextField').slice(0, 3)
  for (const f of textFields) {
    const fd = f.acroField.dict
    const da = fd.lookup(PDFName.of('DA'))
    const ap = fd.lookup(PDFName.of('AP'))
    console.log(`  [${f.getName()}] DA=${da instanceof PDFString ? da.decodeText() : 'none'}  AP=${ap ? 'yes' : 'no'}`)
  }
}

// Template
const tmpl = await readFile('data/pdf-templates/Form25.pdf')
await diag('Form25 template (raw)', tmpl)

// Fill with test data using the same logic as pdf-fill.ts
const pdf = await PDFDocument.load(tmpl)
pdf.registerFontkit(fontkit)
const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const form = pdf.getForm()
const fields = form.getFields()
for (const f of fields) {
  if (f.constructor.name === 'PDFTextField') {
    try { f.setText('샘플 텍스트 Sample') } catch {}
  } else if (f.constructor.name === 'PDFCheckBox') {
    try { f.check() } catch {}
  }
}
form.updateFieldAppearances(font)
const out = await pdf.save()
await writeFile('data/pdf-analysis/form25_filled_sample.pdf', out)
await diag('Form25 filled sample', out)
console.log('\nWritten: data/pdf-analysis/form25_filled_sample.pdf')
