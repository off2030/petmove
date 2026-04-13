'use server'

import { readFile } from 'fs/promises'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import path from 'path'

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

  // Fill checkboxes — draw V at checkbox position since appearances are missing
  const page = pdfDoc.getPages()[0]
  const checkFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  for (const name of checkboxFields) {
    try {
      const field = form.getCheckBox(name)
      const widgets = field.acroField.getWidgets()
      if (widgets.length > 0) {
        const rect = widgets[0].getRectangle()
        page.drawText('V', {
          x: rect.x + 1,
          y: rect.y + 1,
          size: Math.min(rect.width, rect.height) - 2,
          font: checkFont,
          color: rgb(0, 0, 0),
        })
      }
    } catch {
      // Field not found — skip
    }
  }

  // Remove form fields and flatten
  form.flatten()

  const pdfBytes = await pdfDoc.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')

  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  const filename = `VetCert_${petName}.pdf`

  return { ok: true, pdf: base64, filename }
}
