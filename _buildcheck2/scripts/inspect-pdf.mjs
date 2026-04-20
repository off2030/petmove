import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const bytes = await readFile('data/pdf-templates/IdentificationDeclaration.pdf')
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()
const fields = form.getFields()
console.log('Number of fields:', fields.length)
for (const f of fields) {
  console.log(`  ${f.constructor.name}: ${f.getName()}`)
}
