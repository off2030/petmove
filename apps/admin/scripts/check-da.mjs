import { PDFDocument, PDFName } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

for (const file of ['data/pdf-templates/FormRE.pdf', 'data/pdf-templates/Form25.pdf']) {
  const pdf = await PDFDocument.load(await readFile(file))
  const form = pdf.getForm()
  const fieldDAs = new Map() // DA → [field names]
  for (const f of form.getFields()) {
    if (f.constructor.name !== 'PDFTextField') continue
    const da = f.acroField.dict.get(PDFName.of('DA'))
    const daStr = da ? da.toString() : '(no DA)'
    if (!fieldDAs.has(daStr)) fieldDAs.set(daStr, [])
    fieldDAs.get(daStr).push(f.getName())
  }
  console.log(`\n=== ${file} ===`)
  for (const [da, names] of fieldDAs) {
    console.log(`  DA: ${da}`)
    console.log(`    fields (${names.length}): ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}`)
  }
}
