'use server'

import { createClient } from '@/lib/supabase/server'
import { fillPdf, fillPdfMulti } from '@/lib/pdf-fill'
import type { CaseRow } from '@/lib/supabase/types'
import { getEffectiveVaccineList } from '@petmove/domain'
import { loadVetInfo } from '@/lib/vet-info'

export type GeneratePdfResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

/** Result for multi-doc generation: may produce 1+ PDFs if capacity overflows. */
export type GenerateMultiPdfResult =
  | { ok: true; docs: Array<{ pdf: string; filename: string }> }
  | { ok: false; error: string }

/** 별지25와 별지25 EX는 타병원 접종 기록(other_hospital=true)을 제외해서 발급. */
const OTHER_HOSPITAL_EXCLUDED_FORMS = new Set(['Form25', 'Form25AuNz'])
/**
 * 별지25 / 별지25 EX는 한국 수출검역증명서로, 케이스에 입력된 모든 백신/구충 기록을
 * 목적지 필터 없이 무조건 포함시켜야 한다.
 * (다른 서류는 목적지별 vaccine 목록 + extra_visible_fields 토글에 따라 필터링.)
 */
const ALL_VACCINES_FORMS = new Set(['Form25', 'Form25AuNz'])
/** 타병원 접종 체크를 노출하는 백신 데이터 키. */
const OTHER_HOSPITAL_VACCINE_KEYS = ['rabies_dates', 'general_vaccine_dates', 'civ_dates', 'kennel_cough_dates']

/** 타병원 접종 기록을 제외한 data 객체 반환. 해당 배열만 필터, 나머지는 그대로. */
function stripOtherHospitalRecords(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data }
  for (const key of OTHER_HOSPITAL_VACCINE_KEYS) {
    const arr = next[key]
    if (!Array.isArray(arr)) continue
    next[key] = arr.filter((rec) => {
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
        return !(rec as { other_hospital?: boolean }).other_hospital
      }
      return true
    })
  }
  return next
}

async function generate(
  formKey: string,
  caseId: string,
  options?: { includeSignature?: boolean; destination?: string | null; extras?: Record<string, unknown>; rabiesIndices?: number[] },
): Promise<GeneratePdfResult> {
  await loadVetInfo()
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (error || !row) return { ok: false, error: error?.message ?? '케이스를 찾을 수 없습니다' }
  let caseRow = row as CaseRow
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[]) ?? []
  if (OTHER_HOSPITAL_EXCLUDED_FORMS.has(formKey)) {
    caseRow = { ...caseRow, data: stripOtherHospitalRecords(data) }
  }
  // 다중 목적지 케이스에서 UI 활성 목적지를 받아 그 나라 규칙만 적용.
  // 지정이 없으면 컬럼 전체 문자열을 사용(단일 목적지 케이스는 동작 동일).
  // Form25/Form25AuNz 는 한국 수출검역증명서 — 목적지 필터 없이 모든 백신 포함.
  const destForRules = options?.destination ?? caseRow.destination
  const allowedVaccines = ALL_VACCINES_FORMS.has(formKey)
    ? undefined
    : getEffectiveVaccineList(destForRules, extraFields)
  return fillPdf(formKey, caseRow, {
    includeSignature: options?.includeSignature,
    allowedVaccines,
    extras: options?.extras,
    rabiesIndices: options?.rabiesIndices,
  })
}

/**
 * 케이스 없이 (클리닉 레벨) PDF 생성 — Invoice/ESD 처럼 환자 정보가 필요 없는
 * 서류용. 빈 caseRow 를 만들고 extras 로 가변 데이터(tube_count, consignee_lab 등)
 * 를 주입.
 */
async function generateStandalone(
  formKey: string,
  extras: Record<string, unknown>,
): Promise<GeneratePdfResult> {
  await loadVetInfo()
  const stub: CaseRow = {
    id: 'standalone', org_id: '',
    microchip: null, microchip_extra: [],
    customer_name: '', customer_name_en: null,
    pet_name: null, pet_name_en: null,
    destination: null, departure_date: null,
    assigned_to: null,
    data: {},
    created_at: '', updated_at: '',
  }
  return fillPdf(formKey, stub, { extras })
}

/** 모든 generate* 진입점의 공통 옵션. UI 활성 목적지를 destination 으로 전달. */
export type GenerateOpts = {
  includeSignature?: boolean
  destination?: string | null
  /** 별지 25호/EX 의 dedicated 광견병 슬롯에 들어갈 접종 선택. sortedAsc 기준 인덱스. */
  rabiesIndices?: number[]
}

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

export async function generateCH(caseId: string, opts?: GenerateOpts) {
  return generate('CH', caseId, opts)
}

export async function generateVHC(caseId: string, opts?: GenerateOpts) {
  return generate('VHC', caseId, opts)
}

/* 전염병검사 신청서류 — 메뉴는 아직 미연결. 필요 시 cert 버튼으로 wire. */
export async function generateApqaHq(caseId: string, opts?: GenerateOpts) {
  return generate('APQA_HQ', caseId, opts)
}
export async function generateApqaHqEn(caseId: string, opts?: GenerateOpts) {
  return generate('APQA_HQ_En', caseId, opts)
}
export async function generateApqaHqEu(caseId: string, opts?: GenerateOpts) {
  return generate('APQA_HQ_EU', caseId, opts)
}
export async function generateKsvdl(caseId: string, opts?: GenerateOpts) {
  return generate('KSVDL', caseId, opts)
}
export async function generateVbddl(caseId: string, opts?: GenerateOpts) {
  return generate('VBDDL', caseId, opts)
}

/**
 * Invoice / ESD — 클리닉 레벨 배송 서류. caseId 없이 tube_count/consignee_lab 만
 * 받아 생성. 반환 파일명에는 튜브 갯수를 기록.
 */
export type ShipmentOpts = {
  /** 발송 튜브 갯수. 1~5 가 일반적. */
  tube_count: number
  /** 수신 실험실 코드 (ksvdl / ksvdl_r / vbddl). 비워두면 Consignee 공란. */
  consignee_lab?: string
  /** ESD 종 표기. ['dog'] / ['cat'] / ['dog','cat'] (혼합 발송). 미지정 시 ['dog']. */
  species?: ('dog' | 'cat')[]
}

function generateShipperExportRef(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `LVMC${y}${m}${day}`
}

export async function generateInvoice(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  const r = await generateStandalone('Invoice', {
    tube_count: opts.tube_count,
    consignee_lab: opts.consignee_lab ?? '',
    shipper_export_ref: generateShipperExportRef(),
  })
  if (r.ok) r.filename = `Invoice_${opts.tube_count}tubes.pdf`
  return r
}

export async function generateESD(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  const species = opts.species && opts.species.length > 0 ? opts.species : ['dog']
  const r = await generateStandalone('ESD', {
    tube_count: opts.tube_count,
    consignee_lab: opts.consignee_lab ?? '',
    shipper_export_ref: generateShipperExportRef(),
    species,
  })
  if (r.ok) r.filename = `ESD_${opts.tube_count}tubes.pdf`
  return r
}

export async function generateInvoiceAndESD(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  const { PDFDocument } = await import('pdf-lib')
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')

  const [invoiceResult, esdResult] = await Promise.all([
    generateInvoice(opts),
    generateESD(opts),
  ])

  if (!invoiceResult.ok) return invoiceResult
  if (!esdResult.ok) return esdResult

  const invoicePdf = await PDFDocument.load(Buffer.from(invoiceResult.pdf, 'base64'))
  const esdPdf = await PDFDocument.load(Buffer.from(esdResult.pdf, 'base64'))

  const mergedPdf = await PDFDocument.create()
  const invoicePages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices())
  const esdPages = await mergedPdf.copyPages(esdPdf, esdPdf.getPageIndices())

  invoicePages.forEach(page => mergedPdf.addPage(page))
  esdPages.forEach(page => mergedPdf.addPage(page))

  // KSVDL-R(미국행)만 세관 신고서(Customs Declaration for Animal)를 함께 동봉.
  // 템플릿은 정적 PDF — 입력 필드 없음.
  if (opts.consignee_lab === 'ksvdl_r') {
    const customsBuf = await readFile(
      path.join(process.cwd(), 'data', 'pdf-templates', 'Customs_declaration_animal.pdf'),
    )
    const customsPdf = await PDFDocument.load(customsBuf)
    const customsPages = await mergedPdf.copyPages(customsPdf, customsPdf.getPageIndices())
    customsPages.forEach(page => mergedPdf.addPage(page))
  }

  const pdfBytes = await mergedPdf.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')

  const suffix = opts.consignee_lab === 'ksvdl_r' ? '+Customs' : ''
  return {
    ok: true,
    pdf: base64,
    filename: `Invoice+ESD${suffix}_${opts.tube_count}tubes.pdf`,
  }
}

/**
 * 뉴질랜드 전염병검사 3종(VBDDL + APQA HQ + APQA HQ En) 병합 PDF.
 * 검사 탭 "신청" 버튼에서 한 번에 다운로드.
 */
export async function generateNzInfectionPack(caseId: string, opts?: GenerateOpts): Promise<GeneratePdfResult> {
  const { PDFDocument } = await import('pdf-lib')
  const [vbddl, apqaHq, apqaHqEn] = await Promise.all([
    generateVbddl(caseId, opts),
    generateApqaHq(caseId, opts),
    generateApqaHqEn(caseId, opts),
  ])
  if (!vbddl.ok) return vbddl
  if (!apqaHq.ok) return apqaHq
  if (!apqaHqEn.ok) return apqaHqEn

  const merged = await PDFDocument.create()
  for (const r of [vbddl, apqaHq, apqaHqEn]) {
    const doc = await PDFDocument.load(Buffer.from(r.pdf, 'base64'))
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  const pdfBytes = await merged.save()
  return {
    ok: true,
    pdf: Buffer.from(pdfBytes).toString('base64'),
    filename: vbddl.filename.replace(/^VBDDL_/, 'NZ_Infection_'),
  }
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

  // 1차 필터: customer_name + destination 일치 (server side)
  let q = supabase
    .from('cases')
    .select('*')
    .eq('customer_name', p.customer_name)
  q = p.destination ? q.eq('destination', p.destination) : q.is('destination', null)
  const { data: rows, error } = await q
  if (error) return { ok: false, error: error.message }

  // 2차 필터: 출국일 OR 내원일 일치 (vet_visit_date 가 data jsonb 안이라 client side)
  const pivotVet = readVetVisitDate(p)
  const matchesPivot = (c: CaseRow): boolean => {
    const cVet = readVetVisitDate(c)
    const sameDeparture = p.departure_date
      ? c.departure_date === p.departure_date
      : !c.departure_date
    const sameVet = pivotVet ? cVet === pivotVet : !cVet
    return sameDeparture || sameVet
  }

  const all = (rows ?? []) as CaseRow[]
  const matched = all.filter(matchesPivot)
  // Pivot first, rest by created_at ascending (stable ordering).
  const sorted = [
    p,
    ...matched
      .filter(r => r.id !== p.id)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  ]
  return { ok: true, siblings: sorted }
}

function readVetVisitDate(c: CaseRow): string | null {
  const data = (c.data ?? {}) as Record<string, unknown>
  const v = data.vet_visit_date
  return typeof v === 'string' && v ? v : null
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
  await loadVetInfo()
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
