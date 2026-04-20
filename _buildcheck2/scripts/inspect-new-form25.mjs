// 새 별지 제25호 서식의 필드 구조 확인.
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
const b = await readFile('data/pdf-analysis/new-Form25.pdf')
const pdf = await PDFDocument.load(b)
const form = pdf.getForm()
const pages = pdf.getPages()
console.log(`pages: ${pages.length}, fields: ${form.getFields().length}`)
for (const f of form.getFields()) {
  const widgets = f.acroField.getWidgets()
  for (const w of widgets) {
    const r = w.getRectangle()
    // Find which page this widget is on
    let pageIdx = -1
    for (let i = 0; i < pages.length; i++) {
      const annots = pages[i].node.Annots()?.asArray() ?? []
      for (const a of annots) {
        const res = pdf.context.lookup(a)
        if (res === w.dict) { pageIdx = i; break }
      }
      if (pageIdx >= 0) break
    }
    console.log(`p${pageIdx} ${f.constructor.name.padEnd(14)} ${f.getName().padEnd(28)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`)
  }
}
