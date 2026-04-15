import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node inspect-pdf-fields.mjs <pdf> [<pdf>...]')
  process.exit(1)
}

for (const file of files) {
  const bytes = await readFile(file)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fields = form.getFields()
  console.log(`\n=== ${path.basename(file)} (${fields.length} fields) ===`)
  for (const f of fields) {
    const type = f.constructor.name
    const name = f.getName()
    let extra = ''
    if (type === 'PDFTextField') {
      const tf = f
      extra = ` maxLen=${tf.getMaxLength() ?? '-'}`
    }
    console.log(`  [${type}] ${name}${extra}`)
  }
}
