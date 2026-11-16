import type { CaseRow } from './types'
import { destinationCountry, isRepeatDestination } from './destination-names'

// BAI MC 60 (2026-10-26) / MC 61 (2026-11-04):
// https://www.bai.gov.ph/Stakeholders/NewPetImport
// https://www.bai.gov.ph/Issuances/DownloadFile?Id=LI000898

export const PH_RULES_START = '2027-01-01'
export const PH_POLICY_KEYS = ['ph_spsic_approved_date', 'ph_legacy_spsic', 'ph_form1_endorsed_date', 'ph_form1_issue_date', 'ph_importer_name', 'ph_importer_address', 'ph_pregnant', 'ph_last_birth_date', 'ph_government_vet_name', 'ph_government_office'] as const
const PERMIT_KEYS = ['permit_no', 'import_permit_application_date', 'import_permit_recorded_at', 'import_permit_issued_skipped', ...PH_POLICY_KEYS]
export function phToday(): string { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) }
export function phDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  const parsed = new Date(value.length > 10 ? value : value + 'T00:00:00Z')
  if (!Number.isFinite(parsed.getTime())) return ''
  if (value.length > 10) return new Date(parsed.getTime() + 9 * 3600000).toISOString().slice(0, 10)
  return parsed.toISOString().slice(0, 10) === value ? value : ''
}
export function phAddDays(date: string, days: number): string {
  if (!phDate(date)) return ''
  const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days)
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : ''
}
export function phScopedData(row: Pick<CaseRow, 'data' | 'destination'>, destination?: string | null): Record<string, unknown> {
  const token = destination ?? row.destination?.split(',')[0]?.trim() ?? ''
  const data = { ...row.data }
  const scope = (data.by_dest as Record<string, Record<string, unknown>> | undefined)?.[token]
  for (const key of [...PERMIT_KEYS, 'entry_date', 'departure_date']) {
    if (scope && Object.prototype.hasOwnProperty.call(scope, key)) data[key] = scope[key]
    else if (isRepeatDestination(token) || (row.destination ?? '').includes(',')) delete data[key]
  }
  return data
}
export function isPhilippines(destination: string | null | undefined): boolean {
  return !!destination && ['필리핀', 'philippines'].includes(destinationCountry(destination.split(',')[0].trim()).toLowerCase())
}
/** Approval date wins over travel date. Undated historical approvals require verification, not an invented approval date. */
export function philippinesPolicy(row: Pick<CaseRow, 'data' | 'destination' | 'departure_date' | 'updated_at'>, destination?: string | null, today = phToday()): 'legacy' | '2027' | 'review' {
  const data = phScopedData(row, destination)
  const approved = phDate(data.ph_spsic_approved_date)
  const filed = phDate(data.import_permit_application_date)
  if (approved && filed && filed > approved) return 'review'
  if (approved) return approved < PH_RULES_START ? 'legacy' : '2027'
  if (filed >= PH_RULES_START) return '2027'
  const token = destination ?? row.destination?.split(',')[0]?.trim() ?? ''
  const docs = Array.isArray(data.documents) ? data.documents as Record<string, unknown>[] : []
  const permitDocs = docs.filter(d => d.stepId === 'import-permit' && (d.destination === token || (!d.destination && !isRepeatDestination(token))))
  const done = !!String(data.permit_no ?? '').trim() || (data.import_permit_issued_skipped === true && !!filed) || permitDocs.length > 0 || (data.journey_flags as Record<string, unknown> | undefined)?.['import-permit-issued'] === true
  if (data.ph_legacy_spsic === true && done) return 'legacy'
  const recorded = phDate(data.import_permit_recorded_at)
  const oldAttachment = permitDocs.some(d => phDate(d.uploadedAt) && phDate(d.uploadedAt) < PH_RULES_START)
  if (done && ((recorded && recorded < PH_RULES_START) || oldAttachment || (phDate(row.updated_at) && phDate(row.updated_at) < PH_RULES_START))) return 'legacy'
  if (done) return 'review'
  if (filed) return today < PH_RULES_START ? 'legacy' : 'review'
  const travel = phDate(data.entry_date) || phDate(data.departure_date) || ((row.destination ?? '').includes(',') ? '' : phDate(row.departure_date))
  return travel >= PH_RULES_START || today >= PH_RULES_START ? '2027' : 'legacy'
}
export function usesPh2027(row: Pick<CaseRow, 'data' | 'destination' | 'departure_date' | 'updated_at'>, destination?: string | null): boolean {
  return isPhilippines(destination ?? row.destination) && philippinesPolicy(row, destination) !== 'legacy'
}
/** Retain pre-cutover approval evidence when a later edit changes updated_at. No workflow status is written. */
export function preservePhLegacyApprovals(row: CaseRow, nextData: Record<string, unknown>): Record<string, unknown> {
  let result = nextData
  for (const token of (row.destination ?? '').split(',').map(v => v.trim()).filter(isPhilippines)) {
    const data = phScopedData(row, token)
    const docs = Array.isArray(data.documents) ? data.documents as Record<string, unknown>[] : []
    const done = !!String(data.permit_no ?? '').trim() || (data.import_permit_issued_skipped === true && !!phDate(data.import_permit_application_date)) || docs.some(d => d.stepId === 'import-permit' && (d.destination === token || (!d.destination && !isRepeatDestination(token))))
    if (!done || philippinesPolicy(row, token) !== 'legacy') continue
    const byDest = (result.by_dest ?? {}) as Record<string, Record<string, unknown>>
    if (byDest[token]?.ph_legacy_spsic === true) continue
    result = { ...result, by_dest: { ...byDest, [token]: { ...byDest[token], ph_legacy_spsic: true } } }
  }
  return result
}
export function phVaccineUntil(record: Record<string, unknown>): string {
  const date = phDate(record.date)
  if (!date) return ''
  const explicit = phDate(record.valid_until)
  if (explicit) return explicit
  const years = Number(String(record.valid_until ?? '').match(/^(\d+)\s*(년|y|year)/i)?.[1] ?? 1)
  const value = new Date(date + 'T00:00:00Z'); value.setUTCFullYear(value.getUTCFullYear() + years)
  return value.toISOString().slice(0, 10)
}
export function phRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(v => typeof v === 'string' ? { date: v } : v).filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !!phDate(v.date)) : []
}
export interface PhTiterAssessment { record: Record<string, unknown>; index: number; problems: string[] }
/** Validate the actual report, vaccination continuity and sample identity. Never substitute a pending/low result. */
export function assessPhTiters(data: Record<string, unknown>, targetDate = phToday()): PhTiterAssessment[] {
  const vaccines = phRecords(data.rabies_dates).filter(v => phDate(v.date) <= phToday()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return (Array.isArray(data.rabies_titer_records) ? data.rabies_titer_records : []).map((raw, index) => {
    const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const problems: string[] = []
    const date = phDate(record.date)
    if (!date || date > targetDate || date > phToday()) problems.push('채혈일 확인 필요')
    const tested = phDate(record.test_date)
    if (tested && (tested < date || tested > phToday() || tested > targetDate)) problems.push('실제 검사일 확인 필요')
    const text = String(record.value ?? '').trim().replace(/\s*IU\s*\/\s*ml/ig, '')
    const match = text.match(/^(>=|≥|>|=)?\s*(\d+(?:\.\d+)?)$/)
    if (!match || Number(match[2]) < 0.5 || ['pending', 'failed', 'cancelled'].includes(String(record.status))) problems.push('0.5 IU/mL 이상 확정 결과 필요')
    const lab = String(record.lab ?? '').trim().toLowerCase().replace(/[\s-]/g, '_')
    const known = ['apqa_seoul', 'apqa_hq', 'apqa_eu', 'ksvdl_r', 'krsl'].includes(lab)
    if (!known && record.government_approved !== true) problems.push('검사기관 인정 확인 필요')
    const method = String(record.method ?? (known ? 'FAVN' : '')).toUpperCase()
    if (!['FAVN', 'RFFIT'].includes(method)) problems.push('FAVN/RFFIT 검사 필요')
    const chip = phDate(data.microchip_implant_date)
    if (!chip || !date || chip > date) problems.push('채혈 전 마이크로칩 필요')
    const preceding = vaccines.filter(v => phDate(v.date) <= date)
    const last = preceding.at(-1)
    if (!last || phVaccineUntil(last) < date) problems.push('채혈 당시 유효한 광견병 접종 필요')
    let prime = preceding[0]
    for (let i = 1; i < preceding.length; i++) if (phVaccineUntil(preceding[i - 1]) < phDate(preceding[i].date)) prime = preceding[i]
    if (prime && phAddDays(phDate(prime.date), 30) > date) problems.push('최초/재시작 접종 후 30일 이후 채혈 필요')
    let prior = last
    for (const next of vaccines.filter(v => phDate(v.date) > date && phDate(v.date) <= targetDate)) {
      if (prior && phVaccineUntil(prior) < phDate(next.date)) problems.push('접종 유효기간 단절로 항체검사 재실시 필요')
      prior = next
    }
    if (prior && phVaccineUntil(prior) < targetDate) problems.push('입국일까지 광견병 접종 유효기간 유지 필요')
    return { record, index, problems }
  })
}
export function validPhTiter(data: Record<string, unknown>, targetDate?: string): PhTiterAssessment | undefined {
  return assessPhTiters(data, targetDate).filter(t => t.problems.length === 0).sort((a, b) => String(b.record.date).localeCompare(String(a.record.date)))[0]
}

/** Merge successive actual treatment protection intervals; batch expiry is never treatment validity. */
export function hasPhParasiteCoverage(data: Record<string, unknown>, key: string, start: string, end: string): boolean {
  const intervals = phRecords(data[key]).filter(r => phDate(r.date) <= phToday() && phDate(r.valid_until) >= phDate(r.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let covered = ''
  for (const record of intervals) {
    const from = phDate(record.date); const to = phDate(record.valid_until)
    if (!covered) { if (from <= start && to >= start) covered = to }
    else if (from <= phAddDays(covered, 1) && to > covered) covered = to
    if (covered >= end) return true
  }
  return false
}
export function isPhForm1Endorsed(data: Record<string, unknown>, today = phToday()): boolean {
  const issued = phDate(data.ph_form1_issue_date)
  const endorsed = phDate(data.ph_form1_endorsed_date)
  return !!issued && !!endorsed && issued <= endorsed && endorsed <= today
}
