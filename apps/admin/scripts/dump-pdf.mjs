import { PDFDocument, PDFName } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const pdf = await PDFDocument.load(await readFile(process.argv[2]))
const catalog = pdf.catalog
const af = catalog.lookup(PDFName.of('AcroForm'))
console.log('AcroForm:', af ? 'exists' : 'missing')
if (af) {
  console.log('  AcroForm keys:', [...af.keys()].map(k => k.asString()))
  const xfa = af.lookup(PDFName.of('XFA'))
  console.log('  XFA:', xfa ? `present (${xfa.constructor.name})` : 'none')
  const fields = af.lookup(PDFName.of('Fields'))
  console.log('  Fields:', fields?.constructor.name, fields?.size?.())
}
for (let i = 0; i < pdf.getPageCount(); i++) {
  const page = pdf.getPage(i)
  const annots = page.node.Annots()
  console.log(`Page${i} Annots:`, annots?.size?.() ?? 'none')
  if (annots?.size?.()) {
    for (let j = 0; j < Math.min(annots.size(), 5); j++) {
      const a = annots.lookup(j)
      if (a && 'get' in a) {
        const subtype = a.get(PDFName.of('Subtype'))
        const ft = a.get(PDFName.of('FT'))
        const t = a.get(PDFName.of('T'))
        console.log(`  annot[${j}] Subtype=${subtype} FT=${ft} T=${t}`)
      }
    }
  }
}
