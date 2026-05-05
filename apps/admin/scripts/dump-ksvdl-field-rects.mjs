import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const pdf = await PDFDocument.load(await readFile(process.argv[2]))
const form = pdf.getForm()
for (const f of form.getFields()) {
  const widgets = f.acroField.getWidgets()
  for (const w of widgets) {
    const r = w.getRectangle()
    console.log(`${f.constructor.name} ${f.getName()}  x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)}`)
  }
}
