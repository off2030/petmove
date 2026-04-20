import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

for (const pdf of ['FormRE.pdf', 'IdentificationDeclaration.pdf']) {
  const b = await readFile(`data/pdf-templates/${pdf}`)
  const d = await PDFDocument.load(b)
  const names = d.getForm().getFields().map(f => f.getName()).slice(0, 5)
  console.log(`${pdf}: ${names.join(', ')}`)
}
