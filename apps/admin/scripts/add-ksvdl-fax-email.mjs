// Add Fax and E-mail form text fields to KSVDL.pdf in the Vet/Clinic section.
// Phone (text_23tavm) sits at x=61 y=533 w=102 h=11. Fax goes on the same row;
// E-mail one row below. Coordinates are best-effort estimates from visual layout.

import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const SRC = process.argv[2] ?? 'apps/admin/data/pdf-templates/KSVDL.pdf'
const DST = process.argv[3] ?? SRC

const pdf = await PDFDocument.load(await readFile(SRC))
const form = pdf.getForm()
const page = pdf.getPage(0)

// Avoid name collisions on re-run.
const existing = new Set(form.getFields().map(f => f.getName()))

function add(name, x, y, w, h) {
  if (existing.has(name)) {
    console.log(`skip (already exists): ${name}`)
    return
  }
  const tf = form.createTextField(name)
  tf.addToPage(page, { x, y, width: w, height: h, borderWidth: 0 })
  console.log(`added ${name} at x=${x} y=${y} w=${w} h=${h}`)
}

// Estimates — adjust later if visually off.
add('text_24vetf', 200, 533, 100, 11)  // Fax (vet)
add('text_24veml', 80, 517, 220, 11)   // E-mail (vet)

const out = await pdf.save()
await writeFile(DST, out)
console.log(`wrote ${DST}`)
