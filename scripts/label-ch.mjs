import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const bytes = await readFile('data/pdf-templates/CH.pdf')
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
await mkdir('data/pdf-analysis', { recursive: true })
await writeFile('data/pdf-analysis/ch_labeled.pdf', out)
console.log('Written.')
