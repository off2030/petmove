import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const file = process.argv[2]
const fix = process.argv[3] === '--fix'

const pdf = await PDFDocument.load(await readFile(file))
const af = pdf.catalog.lookup(PDFName.of('AcroForm'))
if (!af) { console.log('no AcroForm'); process.exit(0) }

const na = af.get(PDFName.of('NeedAppearances'))
console.log(`NeedAppearances: ${na}`)

// Check first widget for /AP
const fields = af.lookup(PDFName.of('Fields'))
const firstRef = fields.get(0)
const first = firstRef.constructor.name === 'PDFRef' ? pdf.context.lookup(firstRef) : firstRef
const ap = first.get?.(PDFName.of('AP'))
console.log(`First widget /AP: ${ap ? 'present' : 'missing'}`)

if (fix) {
  af.set(PDFName.of('NeedAppearances'), PDFBool.True)
  const out = file.replace(/\.pdf$/i, '_fixed.pdf')
  await writeFile(out, await pdf.save())
  console.log(`→ ${out}`)
}
