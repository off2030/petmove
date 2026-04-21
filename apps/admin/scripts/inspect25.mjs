import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
const b = await readFile('data/pdf-templates/Form25.pdf')
const pdf = await PDFDocument.load(b)
const form = pdf.getForm()
const pages = pdf.getPages()
for (const f of form.getFields()) {
  const widgets = f.acroField.getWidgets()
  for (const w of widgets) {
    const r = w.getRectangle()
    console.log(`${f.constructor.name.padEnd(14)} ${f.getName().padEnd(20)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`)
  }
}
console.log('total:', form.getFields().length)
