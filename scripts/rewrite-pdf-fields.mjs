import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const FORM_RE_RENAMES = {
  text_1qjat: 'consignor_name',
  text_2nuhr: 'consignor_address',
  text_3exby: 'consignee_name',
  text_4awwe: 'consignee_address',
  text_5crif: 'species',
  text_6wglm: 'breed',
  text_7ofgb: 'pet_name',
  checkbox_8hyyf: 'sex_male',
  checkbox_9bydn: 'sex_female',
  text_12rlbb: 'birth_or_age',
  text_11fzjh: 'color',
  checkbox_10xnsg: 'use_pet',
  text_13nycb: 'microchip',
  text_14tpyn: 'id_date',
  text_15zfar: 'rabies_cert_number',
  text_16lnzd: 'rabies_date_1',
  text_17adwh: 'rabies_date_2',
  text_18pwsw: 'rabies_period_1',
  text_19gdds: 'rabies_period_2',
  text_20xmxm: 'rabies_product_1',
  text_22wcld: 'rabies_product_2',
  text_23huei: 'titer_cert_number',
  text_24xnoh: 'titer_date_1',
  text_25wedz: 'titer_value_1',
  text_26whff: 'titer_lab_name_1',
  text_28huet: 'titer_lab_country_1',
  text_29moie: 'vet_name',
  text_30rpnz: 'vet_address',
  text_31ndli: 'inspection_date',
}

const AUTO_DA = '/Helv 0 Tf 0 g'

async function processFile(inputPath, renames) {
  const bytes = await readFile(inputPath)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fields = form.getFields()

  const oldNames = fields.map(f => f.getName())
  const unseen = new Set(Object.keys(renames))
  const unmapped = []

  for (const field of fields) {
    const oldName = field.getName()
    const newName = renames[oldName]
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

  const out = await pdf.save({ updateFieldAppearances: false })
  await writeFile(inputPath, out)

  return {
    file: path.basename(inputPath),
    total: fields.length,
    renamed: fields.length - unmapped.length,
    unmapped,
    unused: [...unseen],
  }
}

const results = []
results.push(await processFile('data/pdf-templates/FormRE.pdf', FORM_RE_RENAMES))

for (const r of results) {
  console.log(`\n[${r.file}] ${r.renamed}/${r.total} renamed, font→Auto`)
  if (r.unmapped.length) console.log('  unmapped:', r.unmapped)
  if (r.unused.length) console.log('  rename entries unused:', r.unused)
}
