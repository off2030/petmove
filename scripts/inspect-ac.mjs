import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
const pdf = await PDFDocument.load(await readFile('data/pdf-templates/FormAC.pdf'))
const form = pdf.getForm()
const fields = form.getFields()
console.log(`Total: ${fields.length}`)
for (const f of fields) {
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle()
    console.log(`${f.constructor.name.padEnd(14)} ${f.getName().padEnd(28)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)}`)
  }
}
