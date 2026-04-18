import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const bytes = await readFile('data/pdf-templates/IdentificationDeclaration.pdf')
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()
const pages = pdf.getPages()

for (const f of form.getFields()) {
  const name = f.getName()
  const widgets = f.acroField.getWidgets()
  for (const w of widgets) {
    const rect = w.getRectangle()
    const ref = w.P()
    let pageIdx = -1
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref === ref) { pageIdx = i; break }
    }
    console.log(`p${pageIdx+1} x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)} ${f.constructor.name} ${name}`)
  }
}
