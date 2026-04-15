// 새로 업데이트된 Form25.pdf에서 자동 생성된 필드명(text_XXXXXX)을
// 위치 기반으로 의미 있는 이름으로 되돌린다.
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const RENAMES = {
  text_73xhcg: 'owner_phone',
  text_75ntsy: 'age_months',
  text_77oecj: 'age_years',
  text_78pnvw: 'microchip_number',
  text_79snvi: 'microchip_implant_date',
  text_80lodv: 'issue_date',
  text_81fpfb: 'birth_date',
}

const AUTO_DA = '/Helv 0 Tf 0 g'
const targetPath = 'data/pdf-templates/Form25.pdf'

const bytes = await readFile(targetPath)
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()
const fields = form.getFields()

const unseen = new Set(Object.keys(RENAMES))
const unmapped = []

for (const field of fields) {
  const oldName = field.getName()
  const newName = RENAMES[oldName]
  if (!newName) {
    unmapped.push(oldName)
    continue
  }
  unseen.delete(oldName)
  field.acroField.setPartialName(newName)

  if (field.constructor.name === 'PDFTextField') {
    field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
    for (const w of field.acroField.getWidgets()) {
      w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
    }
  }
}

await writeFile(targetPath, await pdf.save({ updateFieldAppearances: false }))

console.log(`renamed: ${Object.keys(RENAMES).length - unseen.size}/${Object.keys(RENAMES).length}`)
if (unseen.size) console.log('rename entries unused:', [...unseen])
console.log(`untouched field count: ${unmapped.length} (other fields, should keep existing names)`)
