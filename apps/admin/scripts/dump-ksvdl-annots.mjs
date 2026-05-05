import { PDFDocument, PDFName, PDFDict, PDFRef } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const pdf = await PDFDocument.load(await readFile(process.argv[2]))
const pages = pdf.getPages()
for (let i = 0; i < pages.length; i++) {
  const page = pages[i]
  const annots = page.node.Annots()
  if (!annots) { console.log(`Page ${i}: no annots`); continue }
  console.log(`Page ${i}: ${annots.size()} annots`)
  for (let j = 0; j < annots.size(); j++) {
    let a = annots.lookup(j)
    if (a instanceof PDFRef) a = pdf.context.lookup(a)
    if (!(a instanceof PDFDict)) continue
    const subtype = a.get(PDFName.of('Subtype'))
    const ft = a.get(PDFName.of('FT'))
    const t = a.get(PDFName.of('T'))
    const v = a.get(PDFName.of('V'))
    const as = a.get(PDFName.of('AS'))
    const dv = a.get(PDFName.of('DV'))
    const rect = a.get(PDFName.of('Rect'))
    const f = a.get(PDFName.of('F'))
    const contents = a.get(PDFName.of('Contents'))
    console.log(`  [${j}] Subtype=${subtype} FT=${ft} T=${t} V=${v} AS=${as} DV=${dv} F=${f} Contents=${contents} Rect=${rect}`)
  }
}
