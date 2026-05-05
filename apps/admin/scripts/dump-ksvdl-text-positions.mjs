// Dump text strings on page 0 with their positions
import { PDFDocument, PDFRawStream, PDFContentStream, decodePDFRawStream } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const pdf = await PDFDocument.load(await readFile(process.argv[2]))
const page = pdf.getPage(0)
const contents = page.node.Contents()
let bytes
if (contents instanceof PDFRawStream) {
  bytes = decodePDFRawStream(contents).decode()
} else if (contents instanceof PDFContentStream) {
  bytes = decodePDFRawStream(contents).decode()
} else {
  // Array
  const parts = []
  contents.asArray().forEach(ref => {
    const s = pdf.context.lookup(ref)
    if (s) parts.push(decodePDFRawStream(s).decode())
  })
  const total = parts.reduce((n, p) => n + p.length, 0)
  bytes = new Uint8Array(total)
  let o = 0
  for (const p of parts) { bytes.set(p, o); o += p.length }
}
const txt = Buffer.from(bytes).toString('latin1')
// Look for lines mentioning Fax or E-mail
const lines = txt.split('\n')
let i = 0
for (const line of lines) {
  if (/Fax|E-?mail|Phone/i.test(line)) {
    // print this line and surrounding 4 lines for context
    const start = Math.max(0, i - 3)
    const end = Math.min(lines.length, i + 2)
    for (let j = start; j < end; j++) console.log(`${j}: ${lines[j]}`)
    console.log('---')
  }
  i++
}
