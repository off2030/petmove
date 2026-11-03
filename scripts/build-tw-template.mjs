// Add transparent fields to the unmodified APHIA Form 002 (2025/2/6).
// Source: https://www.aphia.gov.tw/ws.php?id=14261 (attachment id 69375).
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const require = createRequire(new URL('apps/admin/package.json', root))
const { PDFDocument, StandardFonts } = require('pdf-lib')
const source = await readFile(new URL('apps/admin/data/pdf-templates/src/TW-APHIA-20250206.pdf', root))
const pdf = await PDFDocument.load(source)
if (pdf.getPageCount() !== 1 || pdf.getForm().getFields().length) throw Error('Unexpected APHIA source')
const form = pdf.getForm(), page = pdf.getPage(0)
const font = await pdf.embedFont(StandardFonts.Helvetica)
// Coordinates measured from the official PDF; top and bottom use top-left page origin.
export const boxes = {
  origin: [191, 150, 136, 13], certificate_number: [437, 150, 103, 13],
  exporter_name: [229, 166, 99, 13], import_permit_number: [459, 166, 82, 13],
  species: [125, 198, 53, 13], sex: [205, 198, 49, 13], birth_date: [358, 198, 83, 13],
  microchip: [185, 214, 356, 13],
  rabies_name: [228, 262, 114, 13], rabies_manufacturer: [417, 262, 123, 13], rabies_date: [172, 278, 132, 13],
  permit_rabies_name: [228, 326, 114, 13], permit_rabies_manufacturer: [417, 326, 123, 13], permit_rabies_date: [172, 342, 132, 13],
  titer_date: [170, 446, 95, 13], titer_result: [367, 446, 137, 13], titer_lab: [207, 462, 332, 13],
  previous_titer_date: [170, 494, 95, 13], previous_titer_result: [367, 494, 137, 13], previous_titer_lab: [207, 510, 332, 13],
  vet_name: [95, 598, 145, 13], examination_date: [190, 646, 103, 13], vet_signature: [422, 646, 117, 13],
  official_signature: [175, 668, 152, 20], official_name: [136, 708, 191, 17],
  official_stamp: [350, 670, 178, 49], issuing_authority: [63, 752, 330, 11], official_date: [440, 740, 88, 18],
}
for (const [name, [x, top, width, height]] of Object.entries(boxes)) {
  const field = form.createTextField(name)
  field.addToPage(page, { x, y: page.getHeight() - top - height, width, height, borderWidth: 0, backgroundColor: undefined, borderColor: undefined, font })
  field.setText('')
  field.setFontSize(9)
}
form.updateFieldAppearances(font)
pdf.setTitle('APHIA Form 002 - 2025/2/6')
pdf.setSubject(`Official blank source SHA256: ${createHash('sha256').update(source).digest('hex')}`)
const output = new URL('apps/admin/data/pdf-templates/TW.pdf', root)
await writeFile(output, await pdf.save())
console.log(`Built ${form.getFields().length} blank fields: ${fileURLToPath(output)}`)
