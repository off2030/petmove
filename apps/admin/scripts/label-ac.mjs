import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile } from 'node:fs/promises'

const pdf = await PDFDocument.load(await readFile('data/pdf-templates/FormAC.pdf'))
pdf.registerFontkit(fontkit)
const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const form = pdf.getForm()
for (const f of form.getFields()) {
  if (f instanceof PDFTextField) f.setText(f.getName())
  else if (f instanceof PDFCheckBox) f.check()
}
form.updateFieldAppearances(font)
await writeFile('data/pdf-analysis/formAC_labeled.pdf', await pdf.save())
console.log('Written.')
