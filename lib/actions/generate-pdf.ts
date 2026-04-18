'use server'

import { createClient } from '@/lib/supabase/server'
import { fillPdf, fillPdfMulti } from '@/lib/pdf-fill'
import type { CaseRow } from '@/lib/supabase/types'
import { getEffectiveVaccineList } from '@/lib/destination-config'

export type GeneratePdfResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

/** Result for multi-doc generation: may produce 1+ PDFs if capacity overflows. */
export type GenerateMultiPdfResult =
  | { ok: true; docs: Array<{ pdf: string; filename: string }> }
  | { ok: false; error: string }

async function generate(
  formKey: string,
  caseId: string,
  options?: { includeSignature?: boolean; destination?: string | null },
): Promise<GeneratePdfResult> {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (error || !row) return { ok: false, error: error?.message ?? '케이스를 찾을 수 없습니다' }
  const caseRow = row as CaseRow
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[]) ?? []
  // 다중 목적지 케이스에서 UI 활성 목적지를 받아 그 나라 규칙만 적용.
  // 지정이 없으면 컬럼 전체 문자열을 사용(단일 목적지 케이스는 동작 동일).
  const destForRules = options?.destination ?? caseRow.destination
  const allowedVaccines = getEffectiveVaccineList(destForRules, extraFields)
  return fillPdf(formKey, caseRow, { includeSignature: options?.includeSignature, allowedVaccines })
}

/** 모든 generate* 진입점의 공통 옵션. UI 활성 목적지를 destination 으로 전달. */
export type GenerateOpts = { includeSignature?: boolean; destination?: string | null }

export async function generateFormRE(caseId: string, opts?: GenerateOpts) {
  return generate('FormRE', caseId, opts)
}

export async function generateFormAC(caseId: string, opts?: GenerateOpts) {
  return generate('FormAC', caseId, opts)
}

export async function generateIdentificationDeclaration(caseId: string, opts?: GenerateOpts) {
  return generate('IdentificationDeclaration', caseId, opts)
}

export async function generateForm25(caseId: string, opts?: GenerateOpts) {
  return generate('Form25', caseId, opts)
}

export async function generateForm25AuNz(caseId: string, opts?: GenerateOpts) {
  return generate('Form25AuNz', caseId, opts)
}

export async function generateAU(caseId: string, opts?: GenerateOpts) {
  return generate('AU', caseId, opts)
}

export async function generateAU2(caseId: string, opts?: GenerateOpts) {
  return generate('AU_2', caseId, opts)
}

export async function generateAUCat(caseId: string, opts?: GenerateOpts) {
  return generate('AU_Cat', caseId, opts)
}

export async function generateAUCat2(caseId: string, opts?: GenerateOpts) {
  return generate('AU_Cat_2', caseId, opts)
}

export async function generateSGP(caseId: string, opts?: GenerateOpts) {
  return generate('SGP', caseId, opts)
}

export async function generateOVD(caseId: string, opts?: GenerateOpts) {
  return generate('OVD', caseId, opts)
}

export async function generateNZ(caseId: string, opts?: GenerateOpts) {
  // 광견병 접종 횟수로 템플릿 선택: 1회면 NZ(primary), 2회 이상이면 NZ_2(booster).
  // 템플릿마다 (10a)/(10b) 구간에 미리 그어진 취소선이 달라서 결과 PDF의 해당 구간이
  // 깔끔하게 하나만 보이게 된다.
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('cases')
    .select('data')
    .eq('id', caseId)
    .single()
  const dates = ((row?.data as Record<string, unknown> | undefined)?.rabies_dates ?? []) as unknown[]
  const formKey = Array.isArray(dates) && dates.length >= 2 ? 'NZ_2' : 'NZ'
  return generate(formKey, caseId, opts)
}

export async function generateAQS(caseId: string, opts?: GenerateOpts) {
  return generate('AQS_279', caseId, opts)
}

export async function generateFormR11(caseId: string, opts?: GenerateOpts) {
  return generate('Form_R11', caseId, opts)
}

/* ───── Multi-animal Annex/UK generation ───── */

export interface SiblingSummary {
  id: string
  pet_name: string | null
  pet_name_en: string | null
  rabiesDoseCount: number
}

export interface SiblingPreview {
  cases: SiblingSummary[]
  /** Number of documents the pack will produce given current capacity rules. */
  docCount: number
  /** Form key the preview was computed for. */
  formKey: 'AnnexIII' | 'UK'
}

/** Find cases that share the same customer + destination + departure_date with the given case. */
export async function fetchSiblings(caseId: string): Promise<
  { ok: true; siblings: CaseRow[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: pivot, error: pivotErr } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (pivotErr || !pivot) return { ok: false, error: pivotErr?.message ?? '케이스를 찾을 수 없습니다' }
  const p = pivot as CaseRow

  let q = supabase
    .from('cases')
    .select('*')
    .eq('customer_name', p.customer_name)
  q = p.destination ? q.eq('destination', p.destination) : q.is('destination', null)
  q = p.departure_date ? q.eq('departure_date', p.departure_date) : q.is('departure_date', null)
  const { data: rows, error } = await q
  if (error) return { ok: false, error: error.message }

  const all = (rows ?? []) as CaseRow[]
  // Pivot first, rest by created_at ascending (stable ordering).
  const sorted = [
    p,
    ...all
      .filter(r => r.id !== p.id)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  ]
  return { ok: true, siblings: sorted }
}

export async function previewSiblings(caseId: string, formKey: 'AnnexIII' | 'UK'): Promise<
  { ok: true; preview: SiblingPreview } | { ok: false; error: string }
> {
  const r = await fetchSiblings(caseId)
  if (!r.ok) return r
  const summaries: SiblingSummary[] = r.siblings.map(c => ({
    id: c.id,
    pet_name: c.pet_name,
    pet_name_en: c.pet_name_en,
    rabiesDoseCount: rabiesDoseCountOf(c),
  }))
  // Simulate packing to get doc count without actually building PDFs.
  const docCount = simulatePackCount(formKey, summaries)
  return { ok: true, preview: { cases: summaries, docCount, formKey } }
}

function rabiesDoseCountOf(c: CaseRow): number {
  const data = (c.data ?? {}) as Record<string, unknown>
  const dates = data.rabies_dates
  if (!Array.isArray(dates)) return 0
  return dates
    .map(d => (typeof d === 'string' ? d : (d as { date?: string })?.date))
    .filter((d): d is string => typeof d === 'string' && !!d)
    .length
}

function simulatePackCount(formKey: 'AnnexIII' | 'UK', summaries: SiblingSummary[]): number {
  const cap = formKey === 'AnnexIII' ? { animals: 3, vaccRows: 5 } : { animals: 5, vaccRows: 5 }
  let docs = 0
  let remaining = summaries.slice()
  while (remaining.length > 0) {
    const fit: SiblingSummary[] = []
    const leftover: SiblingSummary[] = []
    let vacc = 0
    for (const s of remaining) {
      const d = Math.max(1, s.rabiesDoseCount)
      if (fit.length < cap.animals && vacc + d <= cap.vaccRows) {
        fit.push(s); vacc += d
      } else leftover.push(s)
    }
    if (fit.length === 0) return docs // avoid infinite loop if a single case over-capacity
    docs++
    remaining = leftover
  }
  return docs
}

async function generateMulti(
  formKey: 'AnnexIII' | 'UK',
  caseIds: string[],
): Promise<GenerateMultiPdfResult> {
  if (caseIds.length === 0) return { ok: false, error: '대상 동물이 없습니다' }
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('cases').select('*').in('id', caseIds)
  if (error) return { ok: false, error: error.message }
  // Preserve the order of caseIds.
  const byId = new Map((rows ?? []).map(r => [(r as CaseRow).id, r as CaseRow]))
  const ordered = caseIds.map(id => byId.get(id)).filter((c): c is CaseRow => !!c)
  if (ordered.length === 0) return { ok: false, error: '대상 동물을 찾을 수 없습니다' }

  const results = await fillPdfMulti(formKey, ordered)
  const docs: Array<{ pdf: string; filename: string }> = []
  for (const r of results) {
    if (!r.ok) return { ok: false, error: r.error }
    docs.push({ pdf: r.pdf, filename: r.filename })
  }
  return { ok: true, docs }
}

export async function generateAnnexIIIMulti(caseIds: string[]) {
  return generateMulti('AnnexIII', caseIds)
}

export async function generateUKMulti(caseIds: string[]) {
  return generateMulti('UK', caseIds)
}

// Legacy single-case entry points — kept for non-multi destinations that still use fillPdf.
// Annex/UK should prefer previewSiblings + generate*Multi.
export async function generateAnnexIII(caseId: string) {
  return generate('AnnexIII', caseId)
}

export async function generateUK(caseId: string) {
  return generate('UK', caseId)
}
