import { PDFDocument, PDFName } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
const pdf = await PDFDocument.load(await readFile('data/pdf-templates/Form25AuNz.pdf'))
const seen = new Set()
for (const f of pdf.getForm().getFields()) {
  if (f.constructor.name !== 'PDFTextField') continue
  const da = f.acroField.dict.get(PDFName.of('DA'))
  seen.add(da ? da.toString() : '(no DA)')
}
console.log('Unique DAs:', [...seen])
