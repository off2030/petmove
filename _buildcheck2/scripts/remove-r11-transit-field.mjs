// Permanently remove the "pass Thailand through / By" transit field
// (text_32nbto) from FormR11.pdf — not used for Korea→Thailand direct imports.
import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const TARGET = 'text_32nbto'
const path = 'data/pdf-templates/FormR11.pdf'

const bytes = await readFile(path)
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()

const field = form.getFields().find(f => f.getName() === TARGET)
if (!field) {
  console.log(`Field "${TARGET}" not found — already removed?`)
  process.exit(0)
}

form.removeField(field)
await writeFile(path, await pdf.save())
console.log(`Removed field "${TARGET}" from ${path}`)
