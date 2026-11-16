import { phDate, phRecords, phToday, phVaccineUntil, validPhTiter, isPhForm1Endorsed, type VaccineProduct, type CaseRow } from '@petmove/domain'
import { lookupRabies, lookupComprehensive, lookupCiv, lookupKennelCough, lookupExternalParasite, lookupInternalParasite, lookupParasiteById } from './vaccine-lookups-scoped'
import { VET_INFO } from './vet-info'
import { PDFTextField, type PDFDocument, type PDFFont, type PDFForm } from 'pdf-lib'

type PrintedRecord = { name: string; manufacturer: string; serial: string; date: string; valid_until: string }
type ContinuationField = { label: string; value: string }
const mdy = (value: unknown) => phDate(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1')
function treatment(row: Record<string, unknown>, fallback: VaccineProduct | null, kind: string): PrintedRecord {
  const catalog = row.other_hospital ? null : fallback
  return {
    name: `${kind}: ${String(row.product || catalog?.product || catalog?.vaccine || '')}`,
    manufacturer: String(row.manufacturer || catalog?.manufacturer || ''), serial: String(row.lot || catalog?.batch || ''),
    date: mdy(row.date), valid_until: kind === 'Internal' || kind === 'External' || kind === 'Internal/External' ? mdy(row.valid_until) : mdy(phVaccineUntil(row)),
  }
}
export function phForm1Records(data: Record<string, unknown>): { vacc: PrintedRecord[]; parasite: PrintedRecord[] } {
  const species = data.species === 'dog' ? 'dog' : data.species === 'cat' ? 'cat' : null
  const weightKg = Number(data.weight) || 0
  const vacc: PrintedRecord[] = []
  for (const [key, kind] of [['rabies_dates', 'Rabies'], ['general_vaccine_dates', 'Other vaccine'], ['civ_dates', 'CIV'], ['kennel_cough_dates', 'Kennel cough']] as const) {
    for (const row of phRecords(data[key])) {
      const date = phDate(row.date)
      const product = kind === 'Rabies' ? lookupRabies(date) : kind === 'Other vaccine' ? (species ? lookupComprehensive(species, date) : null) : kind === 'CIV' ? lookupCiv(date) : lookupKennelCough()
      vacc.push(treatment(row, product, kind))
    }
  }
  const parasite: PrintedRecord[] = []
  for (const [key, kind] of [['internal_parasite_dates', 'Internal'], ['external_parasite_dates', 'External']] as const) {
    for (const row of phRecords(data[key])) {
      const date = phDate(row.date)
      const product = row.product_id ? lookupParasiteById(String(row.product_id), { date, weightKg }) : !species ? null : kind === 'Internal' ? lookupInternalParasite(species, date, weightKg) : lookupExternalParasite(species, date, weightKg)
      parasite.push(treatment(row, product, kind))
    }
  }
  return { vacc, parasite }
}
export function resolvePhForm1(transform: string, data: Record<string, unknown>, row: CaseRow): string {
  const key = transform.slice(4)
  if (key === 'importer') return String(data.ph_importer_name || [data.customer_first_name_en, data.customer_last_name_en].filter(Boolean).join(' ') || row.customer_name_en || '')
  if (key === 'address') return String(data.ph_importer_address || data.address_overseas || (data.philippines_extra as Record<string, unknown> | undefined)?.address_overseas || '')
  if (key === 'contact') return [data.phone || data.customer_phone, data.email || (data.philippines_extra as Record<string, unknown> | undefined)?.email].filter(Boolean).join(' / ')
  if (key === 'sex') return String(data.sex ?? '').toLowerCase().includes('female') ? 'F' : String(data.sex ?? '').toLowerCase().includes('male') ? 'M' : ''
  if (key === 'origin') return 'Republic of Korea'
  if (key === 'age') {
    const birth = phDate(data.birth_date); const issue = phDate(data.ph_form1_issue_date) || phToday()
    if (!birth || birth > issue) return ''
    const start = new Date(birth); const end = new Date(issue)
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() - (end.getUTCDate() < start.getUTCDate() ? 1 : 0)
    return `${Math.floor(months / 12)} yrs ${months % 12} months`
  }
  if (key === 'issue_date') return mdy(data.ph_form1_issue_date)
  if (key === 'endorsement_date') return isPhForm1Endorsed(data) ? mdy(data.ph_form1_endorsed_date) : ''
  const recordMatch = key.match(/^(vacc|parasite):(\d+):(name|manufacturer|serial|date|valid_until)$/)
  if (recordMatch) return phForm1Records(data)[recordMatch[1] as 'vacc' | 'parasite'][Number(recordMatch[2])]?.[recordMatch[3] as keyof PrintedRecord] ?? ''
  const titerMatch = key.match(/^titer:(date|test_date|lab|value)$/)
  if (titerMatch) {
    const target = phDate(data.entry_date) || phDate(row.departure_date) || phDate(data.import_permit_application_date) || phToday()
    const record = validPhTiter(data, target)?.record
    if (!record) return ''
    const attr = titerMatch[1]
    if (attr === 'date' || attr === 'test_date') return mdy(record[attr])
    if (attr === 'value') return `${record.value} IU/mL`
    const labs: Record<string, string> = { apqa_seoul: 'APQA Seoul', apqa_hq: 'APQA', apqa_eu: 'APQA', krsl: 'KRSL', ksvdl_r: 'KSVDL' }
    return labs[String(record.lab)] || String(record.lab || '')
  }
  return ''
}
export function phForm1MissingLabels(row: CaseRow): string[] {
  const data = row.data ?? {}
  const labels: string[] = []
  if (!resolvePhForm1('ph1:importer', data, row)) labels.push('Form 1 수입자 영문 이름')
  if (!resolvePhForm1('ph1:address', data, row)) labels.push('Form 1 수입자 주소')
  if (!phDate(data.ph_form1_issue_date)) labels.push('Form 1 발급일')
  const titer = validPhTiter(data, phDate(data.entry_date) || phDate(row.departure_date) || phToday())
  if (!titer) labels.push('필리핀 요건을 충족하는 RNATT 결과')
  else if (!phDate(titer.record.test_date)) labels.push('RNATT 실제 검사일')
  for (const [key, title] of [['internal_parasite_dates', '내부구충'], ['external_parasite_dates', '외부구충']] as const) {
    const records = phRecords(data[key])
    if (!records.length) labels.push(`${title} 처치 기록`)
    else if (records.some(record => !phDate(record.valid_until))) labels.push(`${title} 효력 종료일`)
  }
  if (!phDate(data.ph_form1_endorsed_date)) labels.push('Form 1 정부 확인일 (확인 전 출력본은 초안)')
  return labels
}
/** A long address must remain legible; do not clip it or shrink below 5pt. */
export function collectPhForm1LongFields(form: PDFForm, font: PDFFont): ContinuationField[] {
  const fields: ContinuationField[] = []
  const labels: Record<string, string> = { ph1_importer: 'Importer name', ph1_address: 'Importer address', ph1_contact: 'Importer contact', ph1_gov_name: 'Government veterinarian name', ph1_gov_office: 'Government veterinary office name and address', ph1_pet: 'Animal name', ph1_breed: 'Breed', ph1_color: 'Colour / marks' }
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue
    const value = field.getText() || ''
    const rect = field.acroField.getWidgets()[0]?.getRectangle()
    if (!rect || !value || font.widthOfTextAtSize(value, 5) <= rect.width - 4) continue
    const name = field.getName()
    const record = name.match(/^ph1_(vacc|parasite)_(\d+)_(.+)$/)
    const label = record ? `${record[1] === 'vacc' ? 'Vaccination' : 'Parasite treatment'} row ${Number(record[2]) + 1}: ${record[3]}` : labels[name] || 'Additional Form 1 information'
    fields.push({ label, value })
    field.setText('See continuation')
  }
  return fields
}
/** Preserve all supplied treatments beyond the official form's two rows. */
export function appendPhForm1Continuation(pdf: PDFDocument, data: Record<string, unknown>, row: CaseRow, font: PDFFont, includeVet: boolean, longFields: ContinuationField[] = []): void {
  if (longFields.length) {
    let page = pdf.addPage([612, 936]); let y = 850
    const header = () => {
      page.drawText('FORM 1 - CONTINUATION OF DETAILS', { x: 40, y: 890, size: 12, font })
      page.drawText(`Animal: ${row.pet_name_en || row.pet_name || ''} / Chip: ${row.microchip || ''}`, { x: 40, y: 870, size: 8, font })
      page.drawText('Official veterinarian signature / seal: __________________  Date: ______________', { x: 40, y: 80, size: 9, font })
    }
    header()
    for (const field of longFields) {
      let line = ''
      const lines: string[] = []
      for (const char of `${field.label}: ${field.value.replace(/\s+/g, ' ')}`) {
        if (font.widthOfTextAtSize(line + char, 9) > 530) { lines.push(line); line = '' }
        line += char
      }
      if (line) lines.push(line)
      for (const text of lines) {
        if (y < 125) { page = pdf.addPage([612, 936]); y = 850; header() }
        page.drawText(text, { x: 40, y, size: 9, font }); y -= 14
      }
      y -= 10
    }
  }
  const records = phForm1Records(data)
  const extra = [...records.vacc.slice(2), ...records.parasite.slice(2)]
  for (let offset = 0; offset < extra.length; offset += 16) {
    const page = pdf.addPage([612, 936])
    page.drawText('FORM 1 - CONTINUATION SHEET', { x: 40, y: 885, size: 12, font })
    const draw = (value: string, x: number, y: number, width: number, size = 9) => {
      const clean = value.replace(/[\r\n]/g, ' ')
      const fitted = clean ? Math.min(size, width / Math.max(1, font.widthOfTextAtSize(clean, 1))) : size
      page.drawText(clean, { x, y, font, size: fitted })
    }
    draw(`Animal: ${row.pet_name_en || row.pet_name || ''}    Microchip: ${row.microchip || data.microchip || ''}`, 40, 860, 530)
    draw('Attach inseparably to the animal\'s Form 1 and health certificate.', 40, 840, 530)
    const columns: [keyof PrintedRecord, number, number, string][] = [['name',40,190,'Product / Type'],['manufacturer',235,95,'Manufacturer'],['serial',335,70,'Serial'],['date',410,75,'Administered'],['valid_until',490,80,'Valid until']]
    for (const [, x, w, title] of columns) draw(title, x, 807, w)
    extra.slice(offset, offset + 16).forEach((record, index) => {
      const y = 780 - index * 30
      for (const [key, x, w] of columns) draw(record[key], x, y, w)
      page.drawLine({ start: { x: 40, y: y - 9 }, end: { x: 570, y: y - 9 }, thickness: 0.4 })
    })
    draw(`Attending veterinarian: ${includeVet ? VET_INFO.name_en : ''}`, 40, 235, 530)
    draw('Signature / seal: _______________________   Date: __________________', 40, 210, 530)
    draw('Official veterinarian endorsement / signature / seal: _______________________', 40, 160, 530)
  }
}
