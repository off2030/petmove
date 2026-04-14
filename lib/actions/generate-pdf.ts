'use server'

import { readFile, writeFile, unlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import path from 'path'
import os from 'os'

const execFileAsync = promisify(execFile)

// PDF 템플릿 → DB 필드 매핑
function mapCaseToPdfFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const textFields: Record<string, string> = {}
  const checkboxFields: string[] = []

  // Owner
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  textFields.owner_name = `${firstName} ${lastName}`.trim()
  const phone = (d.phone as string) || ''
  // 010-1234-5678 → +82-10-1234-5678
  textFields.owner_phone = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')
  textFields.owner_address = (d.address_en as string) || ''

  // Age
  const birthDate = (d.birth_date as string) || ''
  if (birthDate) {
    const birth = new Date(birthDate)
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    let months = now.getMonth() - birth.getMonth()
    if (now.getDate() < birth.getDate()) months--
    if (months < 0) { years--; months += 12 }
    textFields.age_years = String(years)
    textFields.age_months = String(months)
    textFields.birth_date = birthDate.replace(/-/g, '/')
  }

  // Animal info
  textFields.color = (d.color_en as string) || ''
  textFields.pet_name = (c.pet_name_en as string) || ''
  textFields.breed = (d.breed_en as string) || ''

  // Weight
  const weight = Number(d.weight) || 0
  textFields.weight_kg = weight ? String(weight) : ''
  if (weight <= 5) checkboxFields.push('weight_under5')
  else if (weight <= 10) checkboxFields.push('weight_5to10')
  else checkboxFields.push('weight_over10')

  // Microchip
  const chip = (c.microchip as string) || ''
  textFields.microchip_no = chip.replace(/\s/g, '')
  if (chip) checkboxFields.push('microchip_yes')
  else checkboxFields.push('microchip_none')
  textFields.microchip_implant_date = ((d.microchip_implant_date as string) || '').replace(/-/g, '/')

  // Species
  if (d.species === 'dog') checkboxFields.push('species_dog')
  else if (d.species === 'cat') checkboxFields.push('species_cat')

  // Sex
  const sexMap: Record<string, string> = {
    female: 'sex_female', male: 'sex_male',
    spayed_female: 'sex_neutered_female', neutered_male: 'sex_neutered_male',
  }
  if (sexMap[d.sex as string]) checkboxFields.push(sexMap[d.sex as string])

  // Rabies dates (may contain strings or {date} objects)
  const rawRabies = (d.rabies_dates as unknown[]) || []
  const rabiesDates = rawRabies.map(v => typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : '').filter(Boolean)
  if (rabiesDates[0]) textFields.rabies1_date = rabiesDates[0].replace(/-/g, '/')
  if (rabiesDates[1]) textFields.rabies2_date = rabiesDates[1].replace(/-/g, '/')
  if (rabiesDates[2]) textFields.rabies3_date = rabiesDates[2].replace(/-/g, '/')

  return { textFields, checkboxFields }
}

export async function generateKoreaVetCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  // Load template
  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '한국_renamed.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    // Fallback: try from 펫무브워크
    try {
      templateBytes = await readFile('G:\\내 드라이브\\펫무브워크\\한국, 일본\\한국_renamed.pdf')
    } catch {
      return { ok: false, error: 'PDF 템플릿을 찾을 수 없습니다' }
    }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

  const { textFields, checkboxFields } = mapCaseToPdfFields(c, d)

  // Fill text fields
  for (const [name, value] of Object.entries(textFields)) {
    if (!value) continue
    try {
      const field = form.getTextField(name)
      field.setText(value)
    } catch {
      // Field not found — skip
    }
  }

  // Keep form fields editable — no flatten

  const pdfBytes = await pdfDoc.save()

  // Use pypdf for checkboxes (pdf-lib can't handle custom appearances)
  const finalBytes = await fillCheckboxesWithPypdf(Buffer.from(pdfBytes), checkboxFields)

  const base64 = finalBytes.toString('base64')

  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  const filename = `VetCert_${petName}.pdf`

  return { ok: true, pdf: base64, filename }
}

// ── Australia ID Declaration ──

const MICROCHIP_DIGIT_FIELDS = [
  'text_22iegx', 'text_24isfk', 'text_25mzkv', 'text_26rkqp', 'text_27hnnh',
  'text_28rfly', 'text_29scbr', 'text_30dyor', 'text_31ilkr', 'text_32vrnm',
  'text_33etmo', 'text_34ugyw', 'text_35vmev', 'text_36wstb', 'text_37rwb',
]

/** Convert YYYY-MM-DD to dd/mm/yy */
function toDdMmYy(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const yy = parts[0].slice(2)
  return `${parts[2]}/${parts[1]}/${yy}`
}

/** Convert YYYY-MM-DD to dd/mm/yyyy */
function toDdMmYyyy(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/** Convert sex DB value to English abbreviation */
function sexToEn(sex: string): string {
  const map: Record<string, string> = {
    male: 'M', female: 'F',
    neutered_male: 'M(N)', spayed_female: 'F(N)',
  }
  return map[sex] || sex
}

/** Convert species DB value to English */
function speciesToEn(species: string): string {
  if (species === 'dog') return 'Dog'
  if (species === 'cat') return 'Cat'
  return species
}

/** Extract rabies date strings from rabies_dates array (handles string or {date} objects) */
function extractRabiesDates(d: Record<string, unknown>): string[] {
  const raw = (d.rabies_dates as unknown[]) || []
  return raw.map(v =>
    typeof v === 'string' ? v
    : (v && typeof v === 'object' && 'date' in (v as Record<string, unknown>))
      ? String((v as Record<string, unknown>).date ?? '')
      : ''
  ).filter(Boolean)
}

function mapCaseToIdFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const textFields: Record<string, string> = {}
  const checkboxFields: string[] = []

  // Animal name (Page 1 + Section B #5)
  const petNameEn = (c.pet_name_en as string) || ''
  textFields.text_1siug = petNameEn
  textFields.text_5upip = petNameEn

  // Date of birth (Page 1 + Section B #6) — dd/mm/yy
  const birthDate = (d.birth_date as string) || ''
  const birthDdMmYy = toDdMmYy(birthDate)
  textFields.text_2gtck = birthDdMmYy
  textFields.text_6truz = birthDdMmYy

  // Name of importer (Section B #4)
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  textFields.text_4wsfw = `${firstName} ${lastName}`.trim()

  // Description: breed, colour (Page 1 + Section B #8)
  const breedEn = (d.breed_en as string) || ''
  const colorEn = (d.color_en as string) || ''
  const description = [breedEn, colorEn].filter(Boolean).join(', ')
  textFields.text_3gevi = description
  textFields.text_7gzzz = description

  // Sex checkboxes — Page 1 (12,17,18,19) + Section B (13,14,15,16)
  const sexMapPage1: Record<string, string> = {
    male: 'checkbox_12cuyn',
    neutered_male: 'checkbox_17haam',
    female: 'checkbox_18zupd',
    spayed_female: 'checkbox_19arlr',
  }
  const sexMapSectionB: Record<string, string> = {
    male: 'checkbox_13gqmq',
    neutered_male: 'checkbox_14sqah',
    female: 'checkbox_15rcpk',
    spayed_female: 'checkbox_16igol',
  }
  const sex = (d.sex as string) || ''
  if (sexMapPage1[sex]) checkboxFields.push(sexMapPage1[sex])
  if (sexMapSectionB[sex]) checkboxFields.push(sexMapSectionB[sex])

  // Microchip — 15 individual digit boxes
  const chip = ((c.microchip as string) || '').replace(/\s/g, '')
  for (let i = 0; i < MICROCHIP_DIGIT_FIELDS.length; i++) {
    textFields[MICROCHIP_DIGIT_FIELDS[i]] = chip[i] || ''
  }

  return { textFields, checkboxFields }
}

export async function generateAustraliaIdDecl(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  // Load template
  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', 'ID.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    try {
      templateBytes = await readFile('C:\\Users\\off20\\OneDrive\\Desktop\\Form\\ID.pdf')
    } catch {
      return { ok: false, error: 'ID.pdf 템플릿을 찾을 수 없습니다' }
    }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

  const { textFields, checkboxFields } = mapCaseToIdFields(c, d)

  // Fill text fields
  for (const [name, value] of Object.entries(textFields)) {
    if (!value) continue
    try {
      const field = form.getTextField(name)
      field.setText(value)
    } catch {
      // Field not found — skip
    }
  }

  // Keep form fields editable — no flatten

  const pdfBytes = await pdfDoc.save()

  // Step 2: Use pypdf to check checkboxes (pdf-lib can't handle custom appearances)
  const finalBytes = await fillCheckboxesWithPypdf(Buffer.from(pdfBytes), checkboxFields)

  const base64 = finalBytes.toString('base64')

  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  const filename = `ID_Decl_${petName}.pdf`

  return { ok: true, pdf: base64, filename }
}

// ── EU Certificate ──

function mapCaseToEuFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const f: Record<string, string> = {}

  // I.1 Consignor
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_1fomr = `${firstName} ${lastName}`.trim()
  f.text_4xkcj = (d.address_en as string) || ''
  const phone = (d.phone as string) || ''
  f.text_6kwtx = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // I.28 Row1 — animal info
  f.text_13yqbv = speciesToEn((d.species as string) || '')
  f.text_12toqh = (d.breed_en as string) || ''
  f.text_14zhbg = sexToEn((d.sex as string) || '')
  f.text_15saus = toDdMmYyyy((d.birth_date as string) || '')
  f.text_16iisx = ((c.microchip as string) || '').replace(/\s/g, '')
  f.text_17wdwy = toDdMmYyyy((d.microchip_implant_date as string) || '')
  f.text_18muyo = (d.color_en as string) || ''

  // Vaccination Row1
  f.text_33rsbf = ((c.microchip as string) || '').replace(/\s/g, '')
  const rabiesDates = extractRabiesDates(d)
  if (rabiesDates[0]) f.text_38gvmq = toDdMmYyyy(rabiesDates[0])

  // Titer Row1
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_63grvq = toDdMmYyyy(titerRecords[0].date || '')
    f.text_68llwb = titerRecords[0].value || ''
  }

  return f
}

export async function generateEuCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '유럽.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: 'EU 증명서 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()
  const fields = mapCaseToEuFields(c, d)

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue
    try { form.getTextField(name).setText(value) } catch {}
  }

  const pdfBytes = await pdfDoc.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')
  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  return { ok: true, pdf: base64, filename: `EU_Cert_${petName}.pdf` }
}

// ── UK Certificate ──

function mapCaseToUkFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const f: Record<string, string> = {}

  // I.1 Consignor
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_71rzrp = `${firstName} ${lastName}`.trim()
  f.text_72dbsc = (d.address_en as string) || ''
  const phone = (d.phone as string) || ''
  f.text_74pdju = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // I.28 Row1 — animal info
  f.text_11bcid = speciesToEn((d.species as string) || '')
  f.text_12pslr = (d.breed_en as string) || ''
  f.text_13eoyt = sexToEn((d.sex as string) || '')
  f.text_14hsoy = toDdMmYyyy((d.birth_date as string) || '')
  f.text_15rtix = ((c.microchip as string) || '').replace(/\s/g, '')
  f.text_16bahe = toDdMmYyyy((d.microchip_implant_date as string) || '')
  f.text_18ztyb = (d.color_en as string) || ''

  // Vaccination Row1
  f.text_34btpu = ((c.microchip as string) || '').replace(/\s/g, '')
  const rabiesDates = extractRabiesDates(d)
  if (rabiesDates[0]) f.text_35keld = toDdMmYyyy(rabiesDates[0])

  // Titer Row1
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_40ecaj = toDdMmYyyy(titerRecords[0].date || '')
    f.text_41snjc = titerRecords[0].value || ''
  }

  return f
}

export async function generateUkCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '영국.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: 'UK 증명서 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()
  const fields = mapCaseToUkFields(c, d)

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue
    try { form.getTextField(name).setText(value) } catch {}
  }

  const pdfBytes = await pdfDoc.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')
  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  return { ok: true, pdf: base64, filename: `UK_Cert_${petName}.pdf` }
}

/** Use pypdf to set checkbox values — works with non-standard appearance keys */
async function fillCheckboxesWithPypdf(pdfBuffer: Buffer, checkboxNames: string[]): Promise<Buffer> {
  if (checkboxNames.length === 0) return pdfBuffer

  const tmpIn = path.join(os.tmpdir(), `pdf_cb_in_${Date.now()}.pdf`)
  const tmpOut = path.join(os.tmpdir(), `pdf_cb_out_${Date.now()}.pdf`)

  try {
    await writeFile(tmpIn, pdfBuffer)

    const script = `
import sys, json
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

names = json.loads(sys.argv[1])
src = sys.argv[2]
dst = sys.argv[3]

reader = PdfReader(src)
writer = PdfWriter()
writer.append(reader)

acro = writer._root_object.get('/AcroForm', {})
fields_list = acro.get('/Fields', [])

for field_ref in fields_list:
    field_obj = field_ref.get_object()
    name = str(field_obj.get('/T', ''))
    if name not in names:
        continue
    field_obj[NameObject('/V')] = NameObject('/Yes')
    kids = field_obj.get('/Kids', [])
    for kid_ref in kids:
        kid = kid_ref.get_object()
        kid[NameObject('/AS')] = NameObject('/Yes')

with open(dst, 'wb') as f:
    writer.write(f)
`
    await execFileAsync('py', [
      '-c', script,
      JSON.stringify(checkboxNames),
      tmpIn,
      tmpOut,
    ])

    return await readFile(tmpOut)
  } finally {
    try { await unlink(tmpIn) } catch {}
    try { await unlink(tmpOut) } catch {}
  }
}
