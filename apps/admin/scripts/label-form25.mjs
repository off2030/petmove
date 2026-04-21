import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'

const bytes = await readFile('data/pdf-templates/Form25.pdf')
const pdf = await PDFDocument.load(bytes)
pdf.registerFontkit(fontkit)
const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
const font = await pdf.embedFont(fontBytes, { subset: false })

const form = pdf.getForm()
for (const f of form.getFields()) {
  const name = f.getName()
  if (f instanceof PDFTextField) f.setText(name)
  else if (f instanceof PDFCheckBox) f.check()
}
form.updateFieldAppearances(font)
await writeFile('data/pdf-analysis/form25_labeled.pdf', await pdf.save())
console.log('Written: data/pdf-analysis/form25_labeled.pdf')

// Print signature-area fields for context
console.log('\nFields in signature vicinity (y 160-230):')
for (const f of form.getFields()) {
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle()
    if (r.y >= 160 && r.y <= 230) {
      console.log(`  ${f.constructor.name.padEnd(14)} ${f.getName().padEnd(22)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)}`)
    }
  }
}
