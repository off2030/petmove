// 각 PDF 템플릿의 텍스트 필드 기본 폰트 크기(DA 문자열) 확인.
// DA에서 "<font> <size> Tf" 형태로 들어 있고, size=0이 auto.
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const templates = ['Form25.pdf', 'Form25AuNz.pdf', 'FormAC.pdf', 'FormRE.pdf', 'IdentificationDeclaration.pdf']

function parseDA(da) {
  // "/Font1 0 Tf 0 g" 같은 문자열에서 Tf 앞의 숫자 추출
  const m = da.match(/\/\S+\s+(-?\d*\.?\d+)\s+Tf/)
  return m ? Number(m[1]) : null
}

for (const t of templates) {
  const pdfBytes = await readFile(path.join('data/pdf-templates', t))
  const pdf = await PDFDocument.load(pdfBytes)
  const form = pdf.getForm()
  const fields = form.getFields()
  const sizes = new Map() // size -> count
  const nonAuto = []
  const noDA = []
  let textCount = 0
  for (const f of fields) {
    if (f.constructor.name !== 'PDFTextField') continue
    textCount++
    const acro = f.acroField
    // Field-level DA
    const fieldDA = acro.dict.lookup(PDFName.of('DA'))
    let da = null
    if (fieldDA instanceof PDFString) da = fieldDA.decodeText()
    // If no field-level DA, check the widget's DA
    if (!da) {
      for (const w of acro.getWidgets()) {
        const wDA = w.dict.lookup(PDFName.of('DA'))
        if (wDA instanceof PDFString) { da = wDA.decodeText(); break }
      }
    }
    if (!da) { noDA.push(f.getName()); continue }
    const size = parseDA(da)
    sizes.set(size, (sizes.get(size) || 0) + 1)
    if (size !== 0) nonAuto.push({ name: f.getName(), size, da })
  }
  console.log(`\n=== ${t} (text fields: ${textCount}) ===`)
  console.log(`  size distribution:`, [...sizes.entries()].map(([s, c]) => `${s === 0 ? 'auto' : s}=${c}`).join(', '))
  if (noDA.length) console.log(`  no DA (${noDA.length}):`, noDA.slice(0, 5).join(', ') + (noDA.length > 5 ? '…' : ''))
  if (nonAuto.length) {
    console.log(`  NON-AUTO (${nonAuto.length}):`)
    for (const { name, size, da } of nonAuto.slice(0, 10)) {
      console.log(`    ${name.padEnd(28)} size=${size}  DA="${da}"`)
    }
    if (nonAuto.length > 10) console.log(`    … +${nonAuto.length - 10} more`)
  } else {
    console.log(`  ✓ all text fields use auto (size=0)`)
  }
}
