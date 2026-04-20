import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
const b = await readFile('data/pdf-analysis/new-Form25AuNz.pdf')
const pdf = await PDFDocument.load(b)
const form = pdf.getForm()
const pages = pdf.getPages()
console.log(`pages: ${pages.length}, fields: ${form.getFields().length}`)
for (const f of form.getFields()) {
  if (f.constructor.name !== 'PDFTextField') continue
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle()
    let pageIdx = -1
    for (let i = 0; i < pages.length; i++) {
      const annots = pages[i].node.Annots()?.asArray() ?? []
      for (const a of annots) {
        const res = pdf.context.lookup(a)
        if (res === w.dict) { pageIdx = i; break }
      }
      if (pageIdx >= 0) break
    }
    console.log(`p${pageIdx} ${f.getName().padEnd(28)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`)
  }
}
