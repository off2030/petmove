// Official BAI Form 1, downloaded 2026-11-16:
// https://www.bai.gov.ph/Transparencies/DownloadFile?Id=12791
// Run from apps/admin. Keep the untouched official original for reproducible layout.
import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'
const layout = JSON.parse(await readFile('data/ph-form1-layout.json', 'utf8'))
const pdf = await PDFDocument.load(await readFile('data/pdf-templates/src/PH_Form1_base.pdf'))
const form = pdf.getForm()
for (const field of form.getFields()) form.removeField(field)
const page = pdf.getPage(0)
for (const [name, rect] of Object.entries(layout)) {
  const field = form.createTextField(name)
  field.addToPage(page, { x: rect.x, y: page.getHeight() - rect.top - rect.height, width: rect.width, height: rect.height, borderWidth: 0, backgroundColor: undefined, borderColor: undefined })
  field.setFontSize(8)
}
await writeFile('data/pdf-templates/PH_Form1.pdf', await pdf.save())
console.log(`PH Form 1: ${Object.keys(layout).length} fields`)
