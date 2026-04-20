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

const FORM_AC_RENAMES = {
  // Top
  text_3efqg:  'exporting_country',
  text_4jyll:  'consignor_name',
  text_5izml:  'consignor_address',
  text_6igov:  'consignee_name',
  // Animal identification
  text_7xwua:  'species',
  text_8bjsb:  'breed',
  text_9vbhv:  'pet_name',
  checkbox_36goul: 'sex_male',
  checkbox_37xoym: 'sex_female',
  text_13tlnw: 'birth_or_age',
  text_14wgoq: 'color',
  checkbox_38rzav: 'use_pet',
  text_15oqtq: 'microchip',
  text_16bkvn: 'id_date',
  // Rabies vaccination (6 rows, latest first per form instruction)
  text_17hwqx: 'rabies1_date',   text_22cuhd: 'rabies1_period', text_25mprj: 'rabies1_product',
  text_18cib:  'rabies2_date',   text_23iajt: 'rabies2_period', text_26wtjh: 'rabies2_product',
  text_21nfys: 'rabies3_date',   text_24qrob: 'rabies3_period', text_27couo: 'rabies3_product',
  text_36ypzn: 'rabies4_date',   text_39noyw: 'rabies4_period', text_42bedq: 'rabies4_product',
  text_37rkbx: 'rabies5_date',   text_40wedy: 'rabies5_period', text_43apgz: 'rabies5_product',
  text_38bndh: 'rabies6_date',   text_41wqon: 'rabies6_period', text_45nmba: 'rabies6_product',
  // Rabies serological test (2 rows)
  text_28mxll: 'titer1_date',    text_30xdu:  'titer1_value',
  text_32zqtv: 'titer1_lab_name', text_46aazp: 'titer1_lab_country',
  text_29hexi: 'titer2_date',    text_31hozo: 'titer2_value',
  text_45kysm: 'titer2_lab_name', text_47nomy: 'titer2_lab_country',
  // Clinical inspection by veterinarian
  text_36zit:  'vet_name',
  text_37sjps: 'vet_address',
  text_38aqfp: 'inspection_date',
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
results.push(await processFile('data/pdf-templates/FormAC.pdf', FORM_AC_RENAMES))

for (const r of results) {
  console.log(`\n[${r.file}] ${r.renamed}/${r.total} renamed, font→Auto`)
  if (r.unmapped.length) console.log('  unmapped:', r.unmapped)
  if (r.unused.length) console.log('  rename entries unused:', r.unused)
}
