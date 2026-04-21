// pdf-fill.ts와 동일한 flow를 재현해서 DR/field-DA가 제대로 박히는지 확인.
import { PDFDocument, PDFName, PDFDict, PDFString } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'

async function runOne(templatePath, label) {
  const bytes = await readFile(templatePath)
  const pdf = await PDFDocument.load(bytes)
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
  const form = pdf.getForm()
  // Minimal fill: just set first 2 text fields with KR for glyph test
  let filled = 0
  for (const f of form.getFields()) {
    if (f.constructor.name === 'PDFTextField' && filled < 2) {
      try { f.setText('홍길동 Sample'); filled++ } catch {}
    }
  }
  form.updateFieldAppearances(font)

  // Apply the same fix the lib now does:
  const fontName = 'NanumGothic'
  const fontRef = font.ref
  const acro = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
  let dr = acro.lookup(PDFName.of('DR'))
  if (!(dr instanceof PDFDict)) { dr = pdf.context.obj({}); acro.set(PDFName.of('DR'), dr) }
  let drFonts = dr.lookup(PDFName.of('Font'))
  if (!(drFonts instanceof PDFDict)) { drFonts = pdf.context.obj({}); dr.set(PDFName.of('Font'), drFonts) }
  drFonts.set(PDFName.of(fontName), fontRef)
  const fieldDA = PDFString.of(`/${fontName} 0 Tf 0 g`)
  for (const field of form.getFields()) {
    if (field.constructor.name !== 'PDFTextField') continue
    field.acroField.dict.set(PDFName.of('DA'), fieldDA)
  }

  // Verify
  const acroAfter = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
  const drAfter = acroAfter.lookup(PDFName.of('DR'))
  const fontsAfter = drAfter instanceof PDFDict ? drAfter.lookup(PDFName.of('Font')) : null
  const fontNames = fontsAfter instanceof PDFDict ? fontsAfter.keys().map(k => k.toString()) : []
  const sampleField = form.getFields().find(f => f.constructor.name === 'PDFTextField')
  const sampleDA = sampleField?.acroField.dict.lookup(PDFName.of('DA'))
  const sampleWidgetAP = sampleField?.acroField.getWidgets()[0]?.dict.lookup(PDFName.of('AP'))

  console.log(`\n=== ${label} ===`)
  console.log(`  DR fonts: ${fontNames.join(', ')}`)
  console.log(`  field DA: ${sampleDA instanceof PDFString ? sampleDA.decodeText() : '-'}`)
  console.log(`  widget AP: ${sampleWidgetAP ? 'yes' : 'NO'}`)

  const out = await pdf.save()
  const outPath = `data/pdf-analysis/${label}_print_fix.pdf`
  await writeFile(outPath, out)
  console.log(`  size: ${out.length} bytes, written: ${outPath}`)
}

await runOne('data/pdf-templates/Form25.pdf', 'Form25')
await runOne('data/pdf-templates/Form25AuNz.pdf', 'Form25AuNz')
await runOne('data/pdf-templates/FormAC.pdf', 'FormAC')
await runOne('data/pdf-templates/FormRE.pdf', 'FormRE')
await runOne('data/pdf-templates/IdentificationDeclaration.pdf', 'IdentificationDeclaration')
