'use server'

import { readFile, writeFile, unlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import {
  lookupRabies,
  lookupComprehensive,
  lookupCiv,
  lookupKennelCough,
  lookupParasiteCombo,
  lookupExternalParasite,
} from '@/lib/vaccine-lookup'
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

  // Rabies dates — 연도별 lookup 자동 반영
  const rawRabies = (d.rabies_dates as unknown[]) || []
  const rabiesDates = rawRabies.map(v => typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : '').filter(Boolean)
  rabiesDates.slice(0, 3).forEach((date, i) => {
    const n = i + 1
    textFields[`rabies${n}_date`] = date.replace(/-/g, '/')
    const rab = lookupRabies(date)
    if (rab) {
      textFields[`rabies${n}_product`] = rab.vaccine ?? ''
      textFields[`rabies${n}_manufacturer`] = rab.manufacturer
      textFields[`rabies${n}_serial`] = rab.batch ?? ''
      // 광견병은 1년 면역 — 1Y 체크
      checkboxFields.push(`rabies${n}_1y`)
    }
  })

  // Other vaccines (종합/CIV/켄넬코프) — 3행 사용
  const species = (d.species as string) === 'cat' ? 'cat' : 'dog'
  let otherRow = 1
  const fillOther = (type: string, date: string, product: string, manufacturer: string, serial: string) => {
    if (otherRow > 3 || !date) return
    textFields[`other${otherRow}_type`] = type
    textFields[`other${otherRow}_date`] = date.replace(/-/g, '/')
    if (product) textFields[`other${otherRow}_product`] = product
    if (manufacturer) textFields[`other${otherRow}_manufacturer`] = manufacturer
    if (serial) textFields[`other${otherRow}_serial`] = serial
    otherRow++
  }

  // 종합백신 (array or single)
  const compRaw = d.comprehensive_dates ?? (d.comprehensive ? [d.comprehensive] : [])
  const compDates = (Array.isArray(compRaw) ? compRaw : []).map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean) as string[]
  if (compDates[0]) {
    const c1 = lookupComprehensive(species, compDates[0])
    fillOther('종합백신', compDates[0], c1?.vaccine ?? '', c1?.manufacturer ?? '', c1?.batch ?? '')
  }

  // CIV 독감
  const civRaw = d.civ_dates ?? (d.civ ? [d.civ] : [])
  const civDates = (Array.isArray(civRaw) ? civRaw : []).map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean) as string[]
  if (civDates[0]) {
    const civ1 = lookupCiv(civDates[0])
    fillOther('CIV', civDates[0], civ1?.vaccine ?? '', civ1?.manufacturer ?? '', civ1?.batch ?? '')
  }

  // 켄넬코프 (강아지 전용)
  if (species === 'dog' && d.kennel_cough_date) {
    const kc = lookupKennelCough()
    fillOther('켄넬코프', String(d.kennel_cough_date), kc?.vaccine ?? '', kc?.manufacturer ?? '', kc?.batch ?? '')
  }

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

/** Split English address by commas, return [line1 (street+city), line2 (region+country)] */
function splitAddressEn(addrEn: string): [string, string] {
  if (!addrEn) return ['', '']
  const parts = addrEn.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 3) return [parts.join(', '), '']
  // Typical Korean: [street, gu, si, do, country] → split 3+rest
  const splitIdx = parts.length >= 5 ? 3 : 2
  const line1 = parts.slice(0, splitIdx).join(', ')
  const line2 = parts.slice(splitIdx).join(', ')
  return [line1, line2]
}

/** Add N years to YYYY-MM-DD date, return dd/mm/yyyy */
function addYearsAndFormat(dateStr: string, years: number): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return ''
  const d = new Date(Number(parts[0]) + years, Number(parts[1]) - 1, Number(parts[2]))
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy}`
}

/** Destinations requiring anti-parasite treatment (tapeworm/Echinococcus) */
const ANTI_PARASITE_COUNTRIES = ['영국', '핀란드', '아일랜드', '몰타', '노르웨이', '북아일랜드']
function needsAntiParasite(destination: string | null | undefined): boolean {
  if (!destination) return false
  const dests = destination.split(',').map(s => s.trim())
  return dests.some(d => ANTI_PARASITE_COUNTRIES.includes(d))
}

function mapCaseToEuFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const f: Record<string, string> = {}

  const chipDigits = ((c.microchip as string) || '').replace(/\s/g, '')

  // ── I.1 Consignor (owner, Korea) ──
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_1fomr = `${firstName} ${lastName}`.trim()
  const [addrLine1, addrLine2] = splitAddressEn((d.address_en as string) || '')
  f.text_4xkcj = addrLine1
  f.text_5gosd = addrLine2
  const phone = (d.phone as string) || ''
  f.text_6kwtx = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // ── I.5 Consignee (destination contact) ──
  // 이름, 해외주소+우편번호, 해외 전화번호. 데이터 없으면 비움 (구조만 유지)
  f.text_7nccq = '' // Name — 추후
  f.text_8fqzz = (d.address_overseas as string) || '' // 해외 주소
  f.text_9tish = '' // Postal code — 추후
  f.text_10edla = '' // 해외 전화번호 — 추후

  // ── I.18 Description of commodity ──
  f.text_11wrua = speciesToEn((d.species as string) || '')

  // ── I.28 Row1 — Identification of commodities ──
  // 실제 PDF 컬럼 순서 (좌→우): Species | Sex | Colour | Breed | ID System | Transponder No | DOB
  f.text_13yqbv = speciesToEn((d.species as string) || '')        // Species
  f.text_12toqh = sexToEn((d.sex as string) || '')                // Sex
  f.text_14zhbg = (d.color_en as string) || ''                    // Colour
  f.text_15saus = (d.breed_en as string) || ''                    // Breed
  f.text_16iisx = chipDigits ? 'Transponder' : ''                 // ID System
  f.text_17wdwy = chipDigits                                      // Transponder Number
  f.text_18muyo = toDdMmYyyy((d.birth_date as string) || '')      // Date of birth

  // ── Vaccination Row1 ──
  // 광견병 접종일로 제품 정보 자동 조회 (data/vaccine-products.json)
  const rabiesDates = extractRabiesDates(d)
  f.text_33rsbf = chipDigits                                      // Transponder
  if (rabiesDates[0]) {
    const rab = lookupRabies(rabiesDates[0])
    f.text_38gvmq = toDdMmYyyy(rabiesDates[0])                    // Date of vaccination
    if (rab) {
      f.text_43mfoe = `${rab.vaccine ?? ''} (${rab.manufacturer})`.trim()  // Vaccine name + manufacturer
      f.text_48ittw = rab.batch ?? ''                             // Batch number
    }
    f.text_50yagc = toDdMmYyyy(rabiesDates[0])                    // Validity from
    f.text_58ivbr = addYearsAndFormat(rabiesDates[0], 1)          // Validity to (접종일+1년)
  }

  // ── Blood sampling (Titer) Row1 ──
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_63grvq = toDdMmYyyy(titerRecords[0].date || '')
    f.text_68llwb = titerRecords[0].value || ''
  }

  // ── Anti-parasite treatment (영국/핀란드/아일랜드/몰타/노르웨이/북아일랜드만) ──
  if (needsAntiParasite(c.destination as string)) {
    f.text_73brgu = chipDigits // Row1 Transponder
    // 구충 제품 자동 조회 (체중 + 종 기반)
    const weight = Number(d.weight) || 0
    const parasiteSp: 'dog' | 'cat' = (d.species as string) === 'cat' ? 'cat' : 'dog'
    const parasite = weight > 0 ? lookupParasiteCombo(parasiteSp, weight) : null
    if (parasite) {
      f.text_78mbys = parasite.product ?? ''      // Product name
      f.text_83ucjz = parasite.manufacturer       // Manufacturer
      // Date and time (text_88lvnb)은 실제 투약일 데이터가 있으면 추후
    }
  }

  // ── P6 Model of declaration ──
  // 고객명 (undersigned), 마이크로칩번호
  const customerName = (c.customer_name as string) || `${firstName} ${lastName}`.trim()
  f.text_2kyio = customerName
  f.text_1ehrq = chipDigits

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
  const chipDigits = ((c.microchip as string) || '').replace(/\s/g, '')

  // I.1 Consignor (보호자) — 주소 2줄 분리
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_71rzrp = `${firstName} ${lastName}`.trim()
  const [addr1, addr2] = splitAddressEn((d.address_en as string) || '')
  f.text_72dbsc = addr1
  f.text_73ccfv = addr2
  const phone = (d.phone as string) || ''
  f.text_74pdju = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // I.28 Row1 — EU 양식과 동일한 컬럼 재배치 적용
  // Species | Sex | Colour | Breed | ID System | Transponder No | DOB
  f.text_11bcid = speciesToEn((d.species as string) || '')        // Species
  f.text_12pslr = sexToEn((d.sex as string) || '')                // Sex
  f.text_13eoyt = (d.color_en as string) || ''                    // Colour
  f.text_14hsoy = (d.breed_en as string) || ''                    // Breed
  f.text_15rtix = chipDigits ? 'Transponder' : ''                 // ID System
  f.text_16bahe = chipDigits                                      // Transponder Number
  f.text_18ztyb = toDdMmYyyy((d.birth_date as string) || '')      // DOB

  // Vaccination Row1 — 광견병 제품 자동 조회
  const rabiesDates = extractRabiesDates(d)
  f.text_34btpu = chipDigits
  if (rabiesDates[0]) {
    f.text_35keld = toDdMmYyyy(rabiesDates[0])
    // UK 템플릿에 Vaccine name/Manufacturer/Batch 필드가 있다면 추후 매핑
    const rab = lookupRabies(rabiesDates[0])
    if (rab) {
      // UK cert 추가 필드는 템플릿 분석 후 매핑
    }
  }

  // Titer Row1
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_40ecaj = toDdMmYyyy(titerRecords[0].date || '')
    f.text_41snjc = titerRecords[0].value || ''
  }

  // Echinococcus treatment — UK는 필수
  const weightUk = Number(d.weight) || 0
  const speciesUk: 'dog' | 'cat' = (d.species as string) === 'cat' ? 'cat' : 'dog'
  const parasite = weightUk > 0 ? lookupParasiteCombo(speciesUk, weightUk) : null
  if (parasite) {
    // UK 템플릿의 treatment 테이블 필드는 추후 매핑 (현재 필드명 미확인)
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
