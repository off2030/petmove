import { PDFDocument, PDFName, PDFString, PDFNumber, PDFArray } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = process.argv.slice(2)

for (const file of files) {
  const bytes = await readFile(file)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fields = form.getFields()
  const pages = pdf.getPages()

  console.log(`\n=== ${path.basename(file)} ===`)
  console.log(`Pages: ${pages.length}, Fields: ${fields.length}`)

  for (const f of fields) {
    const type = f.constructor.name
    const name = f.getName()
    const widgets = f.acroField.getWidgets()
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]
      const rect = w.getRectangle()
      const pageRef = w.P()
      let pageIdx = -1
      for (let p = 0; p < pages.length; p++) {
        if (pages[p].ref === pageRef) { pageIdx = p; break }
      }
      console.log(`[${type}] ${name}  page=${pageIdx} x=${rect.x.toFixed(1)} y=${rect.y.toFixed(1)} w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)}${widgets.length > 1 ? ` (widget ${i+1}/${widgets.length})` : ''}`)
    }
  }
}
