import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const bytes = await readFile('data/pdf-templates/IdentificationDeclaration.pdf')
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()
for (const f of form.getFields()) {
  const name = f.getName()
  if (f instanceof PDFTextField) {
    f.setText(name)
  } else if (f instanceof PDFCheckBox) {
    f.check()
  }
}
const out = await pdf.save()
await writeFile('data/pdf-analysis/identification_labeled.pdf', out)
console.log('Written.')
