// 호주/뉴질랜드/괌용 별지 제25호 서식 템플릿의 자동 생성 필드명 복구.
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const RENAMES = {
  text_91ldww: 'owner_phone',
  text_93npor: 'owner_address',
  text_94psqd: 'color_marks',
  text_95bvdf: 'age_years',
  text_96yzlw: 'age_months',
  text_97vgtj: 'species_other_text',
  text_98jnmr: 'breed',
  text_99fpna: 'pet_name',
  text_101xuqh: 'weight_kg',
  text_103mjxj: 'microchip_number',
  text_104mwhr: 'issue_date',
  text_105qnjy: 'vet_name',
  text_106cfap: 'vet_license_number',
}

const AUTO_DA = '/Helv 0 Tf 0 g'
const targetPath = 'data/pdf-templates/Form25AuNz.pdf'

const bytes = await readFile(targetPath)
const pdf = await PDFDocument.load(bytes)
const form = pdf.getForm()

const unseen = new Set(Object.keys(RENAMES))
let renamed = 0

for (const field of form.getFields()) {
  const oldName = field.getName()
  const newName = RENAMES[oldName]
  if (!newName) continue
  unseen.delete(oldName)
  field.acroField.setPartialName(newName)
  renamed++
  if (field.constructor.name === 'PDFTextField') {
    field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
    for (const w of field.acroField.getWidgets()) {
      w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
    }
  }
}

await writeFile(targetPath, await pdf.save({ updateFieldAppearances: false }))
console.log(`renamed: ${renamed}/${Object.keys(RENAMES).length}`)
if (unseen.size) console.log('unused:', [...unseen])
