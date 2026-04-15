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

const ID_DECL_RENAMES = {
  // Page 1 — Exporter/Official header
  text_1siug: 'animal_name',
  text_2gtck: 'birth_date',
  text_3gevi: 'breed_desc',
  checkbox_12cuyn: 'sex_male_entire',
  checkbox_34toyq: 'sex_neutered_male',
  checkbox_35kupz: 'sex_female_entire',
  checkbox_36xpuj: 'sex_neutered_female',
  // Page 2 — Section B items 4-8
  text_4wsfw: 'importer_name',
  text_5upip: 'animal_name_b',
  text_6truz: 'birth_date_b',
  checkbox_37ltqi: 'sex_b_male',
  checkbox_38gsco: 'sex_b_neutered_male',
  checkbox_39pyxd: 'sex_b_female',
  checkbox_40xvtw: 'sex_b_neutered_female',
  text_7gzzz: 'description_b',
  text_33hgor: 'microchip_site',
  // Microchip 1 (primary) — 15 digits, left→right at y≈511
  text_22iegx: 'chip1_01',
  text_41dwso: 'chip1_02',
  text_43nwcf: 'chip1_03',
  text_44legb: 'chip1_04',
  text_45gmsu: 'chip1_05',
  text_46drhi: 'chip1_06',
  text_47uukw: 'chip1_07',
  text_48svhv: 'chip1_08',
  text_49zlsr: 'chip1_09',
  text_51rrxz: 'chip1_10',
  text_52foqc: 'chip1_11',
  text_53evhe: 'chip1_12',
  text_54ohnu: 'chip1_13',
  text_55unrk: 'chip1_14',
  text_56qffx: 'chip1_15',
  // Microchip 2 (secondary if present) — 15 digits, y≈461
  text_57xji:  'chip2_01',
  text_58rfwo: 'chip2_02',
  text_59pc:   'chip2_03',
  text_60wiua: 'chip2_04',
  text_61cqzu: 'chip2_05',
  text_62ybhe: 'chip2_06',
  text_63atvl: 'chip2_07',
  text_64uoih: 'chip2_08',
  text_65reid: 'chip2_09',
  text_66upid: 'chip2_10',
  text_67tggs: 'chip2_11',
  text_68vgww: 'chip2_12',
  text_69uoih: 'chip2_13',
  text_70qnlz: 'chip2_14',
  text_71zrmh: 'chip2_15',
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
results.push(await processFile('data/pdf-templates/IdentificationDeclaration.pdf', ID_DECL_RENAMES))

for (const r of results) {
  console.log(`\n[${r.file}] ${r.renamed}/${r.total} renamed, font→Auto`)
  if (r.unmapped.length) console.log('  unmapped:', r.unmapped)
  if (r.unused.length) console.log('  rename entries unused:', r.unused)
}
