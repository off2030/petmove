'use server'

import { createClient } from '@petmove/auth/server'
import { fillPdf, fillPdfMulti } from '@/lib/pdf-fill'
import type { CaseRow } from '@petmove/domain'
import { getEffectiveVaccineList, flattenCaseForDestination, getDepartureDate, getVetVisitDate, parseDestinations, buildCaseJourneyContext, SINGLE_DOSE_RABIES_DESTINATIONS, isRabiesTiterReturnOnly, recommendRabiesDoseIndices } from '@petmove/domain'
import { loadEffectiveVetInfo } from '@/lib/vet-info'

export type GeneratePdfResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

/** Result for multi-doc generation: may produce 1+ PDFs if capacity overflows. */
export type GenerateMultiPdfResult =
  | { ok: true; docs: Array<{ pdf: string; filename: string }> }
  | { ok: false; error: string }

/** 별지25와 별지25 EX는 타병원 접종 기록(other_hospital=true)을 제외해서 발급.
 * FormRE 는 타병원 접종도 그대로 노출 (1차 항체검사 후 룰만 적용). */
const OTHER_HOSPITAL_EXCLUDED_FORMS = new Set(['Form25', 'Form25AuNz'])
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
  options?: { includeSignature?: boolean; includeVet?: boolean; destination?: string | null; extras?: Record<string, unknown>; rabiesIndices?: number[] },
): Promise<GeneratePdfResult> {
  await loadEffectiveVetInfo()
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
  // 다중 여행지 케이스에서 UI 활성 여행지를 받아 그 나라 규칙만 적용.
  // 지정이 없으면 컬럼 전체 문자열을 사용(단일 여행지 케이스는 동작 동일).
  // 모든 form 이 케이스 상세 노출 규칙(여행지별 vaccine list + extra_visible_fields
  // 토글)과 동일한 필터 — 별지25/AuNz 도 예외 없이. 추가 백신 기록을 PDF 에 노출
  // 하려면 케이스 상세 "절차정보 → 항목 추가" 로 해당 vaccine 토글 ON.
  const destForRules = options?.destination ?? caseRow.destination
  const allowedVaccines = getEffectiveVaccineList(destForRules, extraFields)
  // 다중 여행지 케이스: 활성 여행지의 by_dest 값을 top-level 로 평탄화한 caseRow 로 채움.
  // 단일 여행지 또는 by_dest 미사용 케이스는 그대로.
  // destination 미지정 호출(검사탭 KSVDL·VBDDL+APQA·ARC 버튼 등 — caseId 만 넘김)에서도
  // 단일 여행지면 그 토큰으로 flatten 해서 by_dest 에 저장된 scoped 값(vet_visit_date 등)이
  // top-level 로 올라와 폼에 채워지게 한다. 다중 여행지인데 미지정이면 어느 토큰인지 알 수
  // 없어 no-op(기존 동작) — 콤마-조인 문자열을 by_dest 키로 쓰면 scoped 필드가 전부 삭제됨.
  // (cases-app 은 단일·다중 모두 항상 destination 을 넘기므로 이 폴백 영향 없음.)
  const flattenDest =
    options?.destination ??
    (parseDestinations(caseRow.destination).length === 1 ? caseRow.destination : null)
  caseRow = flattenCaseForDestination(caseRow, flattenDest)
  return fillPdf(formKey, caseRow, {
    includeSignature: options?.includeSignature,
    includeVet: options?.includeVet,
    allowedVaccines,
    extras: options?.extras,
    rabiesIndices: options?.rabiesIndices,
  })
}

/** 별지25/EX 광견병 dose 기본 선택 추천. */
export type RabiesRecommendation = {
  /**
   * "최근 1건이면 충분한" 광견병 모델 국가인지 — 1회+항체검사(EU·태국·필리핀) 또는
   * 입국 항체검사 없음(미국·캐나다 등). false 면 모달은 기존대로 전체 체크 기본.
   */
  applies: boolean
  /** 추천 선택 — normalizeAsc(date 오름차순) 공간의 ascIndex 배열. */
  indices: number[]
}

/**
 * 별지25/별지25 EX 발행 시 광견병 dose 의 **기본 선택**을 국가 검증 규칙으로 추천.
 * "최근 1건이면 충분한" 모델 국가에서만 의미:
 *  - 1회 접종 + 항체검사(EU·태국·필리핀): 기본 최근 1건, 규정 미달이면 anchor 까지 확장.
 *  - 입국 항체검사 없음(미국·캐나다 등 rabiesTiterForReturnOnly): 항상 최근 1건.
 * 모달이 열릴 때 프리셀렉트로 사용 (recommendRabiesDoseIndices 참조).
 */
export async function recommendForm25RabiesSelection(
  caseId: string,
  formKey: 'Form25' | 'Form25AuNz',
  destination?: string | null,
): Promise<RabiesRecommendation> {
  const supabase = await createClient()
  const { data: row } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (!row) return { applies: false, indices: [] }
  let caseRow = row as CaseRow
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  // 별지25/EX 는 타병원 접종 제외 — 모달 normalize·서버 fill 과 동일 공간을 맞춤.
  if (OTHER_HOSPITAL_EXCLUDED_FORMS.has(formKey)) {
    caseRow = { ...caseRow, data: stripOtherHospitalRecords(data) }
  }
  // 활성 여행지 기준 평탄화 — by_dest 출국일·검사일 등이 top-level 로 올라와 체크가 정확.
  const flattenDest =
    destination ?? (parseDestinations(caseRow.destination).length === 1 ? caseRow.destination : null)
  caseRow = flattenCaseForDestination(caseRow, flattenDest)
  // country 키 — 활성 여행지 토큰 우선, 없으면 케이스 destination 으로 정규화.
  const destToken = destination ?? caseRow.destination
  const key = buildCaseJourneyContext({ ...caseRow, destination: destToken ?? null }).destinationKey
  // 적용 대상: 1회+항체검사 모델(EU 가족·태국·필리핀) 또는 입국 항체검사 없는 국가(미국·캐나다 등).
  const applies = !!key && (SINGLE_DOSE_RABIES_DESTINATIONS.includes(key) || isRabiesTiterReturnOnly(destToken))
  if (!applies || !key) return { applies: false, indices: [] }
  // 평탄화 완료 → 체크 ctx 의 destination 은 null(top-level 값 사용).
  return { applies: true, indices: recommendRabiesDoseIndices(caseRow, key, null) }
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
  await loadEffectiveVetInfo()
  const stub: CaseRow = {
    id: 'standalone', org_id: '',
    microchip: null, microchip_extra: [],
    customer_name: '', customer_name_en: null,
    pet_name: null, pet_name_en: null,
    destination: null, departure_date: null,
    assigned_to: null,
    avatar_emoji: null, avatar_color: null, avatar_photo_url: null,
    transport_org_id: null,
    data: {},
    created_at: '', updated_at: '',
  }
  return fillPdf(formKey, stub, { extras })
}

/** 모든 generate* 진입점의 공통 옵션. UI 활성 여행지를 destination 으로 전달. */
export type GenerateOpts = {
  includeSignature?: boolean
  /** 수의사/병원 정보·발급일 노출 여부. 기본 true. false 면 해당 필드 모두 공백. */
  includeVet?: boolean
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

export async function generateTW(caseId: string, opts?: GenerateOpts) {
  return generate('TW', caseId, opts)
}

/** 튀르키예(Türkiye) 수입용 오리진·수의 건강증명서 (TK.pdf). */
export async function generateTK(caseId: string, opts?: GenerateOpts) {
  return generate('TK', caseId, opts)
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
/** 남아프리카공화국 ARC-OVI 전염병검사 시료제출서 (Form 6). */
export async function generateArcOvi(caseId: string, opts?: GenerateOpts) {
  return generate('ARC-OVI', caseId, opts)
}
/** 남아프리카공화국 진단시료 수입용 Veterinary Health Certificate (MIP). */
export async function generateVhcMip(caseId: string, opts?: GenerateOpts) {
  return generate('VHC_MIP', caseId, opts)
}
/** 수의사면허증 영문 번역본 (남아공 제출용) — 번역확인 Date 만 채움. */
export async function generateVetLicenseZa(caseId: string, opts?: GenerateOpts) {
  return generate('VetLicense_ZA', caseId, opts)
}

/**
 * 남아공 ARC-OVI 발송 서류 3종을 하나의 PDF로 병합:
 * ① ARC-OVI 시료제출서 → ② VHC for MIP 건강증명서 → ③ 수의사면허증 영문본.
 */
export async function generateArcOviPack(caseId: string, opts?: GenerateOpts): Promise<GeneratePdfResult> {
  const { PDFDocument } = await import('pdf-lib')
  const [arc, vhc, lic] = await Promise.all([
    generateArcOvi(caseId, opts),
    generateVhcMip(caseId, opts),
    generateVetLicenseZa(caseId, opts),
  ])
  if (!arc.ok) return arc
  if (!vhc.ok) return vhc
  if (!lic.ok) return lic

  const merged = await PDFDocument.create()
  for (const r of [arc, vhc, lic]) {
    const doc = await PDFDocument.load(Buffer.from(r.pdf, 'base64'))
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  const pdfBytes = await merged.save()
  return {
    ok: true,
    pdf: Buffer.from(pdfBytes).toString('base64'),
    filename: arc.filename.replace(/^ARC-OVI_/, 'ARC-OVI_Pack_'),
  }
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
  /**
   * 발송일 = 전염병 검사일(채혈일, YYYY-MM-DD). 채혈일에 맞춰 수일 전 미리 발급할 때
   * 케이스의 검사일을 지정. Invoice/ESD 의 날짜 칸 + 수출 ref(LVMCYYYYMMDD)에 사용.
   * 미지정 시 오늘.
   */
  ship_date?: string
}

/** 발송일(전염병 검사일) 기준 수출 참조번호. YYYY-MM-DD 형식이면 그 날짜, 아니면 오늘. */
function generateShipperExportRef(shipDate?: string): string {
  const m = (shipDate ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `LVMC${m[1]}${m[2]}${m[3]}`
  const d = new Date()
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `LVMC${y}${mm}${day}`
}

/** ARC-OVI(남아공) 표준 검체 구성 — 혈청 3ml×3 + EDTA 전혈 0.5ml×10 + 무염색 도말×3 = 16점. */
const ARC_SPECIMEN_COUNT = 16
/** ARC 인보이스 Full Description of Goods (혼합 검체라 통관 단위는 EA). */
const ARC_INVOICE_GOODS = [
  'Exempt Animal Specimen',
  '',
  'Non-infectious canine specimens for diagnostic testing:',
  ' - Serum 3ml x 3 tubes',
  ' - EDTA whole blood 0.5ml x 10 tubes',
  ' - Unstained blood smear x 3 slides',
  '',
  'For diagnostic testing only. Not for resale.',
  'No commercial value. Value for customs purpose only.',
  'Manufacturer is the shipper. MID: KRLAUVET329SEO',
].join('\n')

export async function generateInvoice(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  // ARC-OVI(남아공)는 표준 16점 혼합 검체 — 수량·품목 설명·단위를 고정값으로 덮어씀.
  // 그 외 lab 은 빈 값 → preserveTemplateText 가 템플릿 기본값(canine serum / Tube) 유지.
  const isArc = (opts.consignee_lab ?? '').toLowerCase() === 'arc_ovr'
  const tubeCount = isArc ? ARC_SPECIMEN_COUNT : opts.tube_count
  const r = await generateStandalone('Invoice', {
    tube_count: tubeCount,
    consignee_lab: opts.consignee_lab ?? '',
    shipper_export_ref: generateShipperExportRef(opts.ship_date),
    // 날짜 칸(date_or_today): 검사일 있으면 그 날짜, 없으면 오늘.
    ship_date: opts.ship_date ?? '',
    goods_description: isArc ? ARC_INVOICE_GOODS : '',
    goods_unit: isArc ? 'EA' : '',
    // ARC(남아공) 수출용 HS 코드. 그 외 lab 은 빈 값 → 템플릿 기본(3002905250) 유지.
    goods_hs_code: isArc ? '3002.12.00.6' : '',
  })
  if (r.ok) r.filename = `Invoice_${tubeCount}tubes.pdf`
  return r
}

export async function generateESD(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  const species = opts.species && opts.species.length > 0 ? opts.species : ['dog']
  const r = await generateStandalone('ESD', {
    tube_count: opts.tube_count,
    consignee_lab: opts.consignee_lab ?? '',
    shipper_export_ref: generateShipperExportRef(opts.ship_date),
    ship_date: opts.ship_date ?? '',
    species,
  })
  if (r.ok) r.filename = `ESD_${opts.tube_count}tubes.pdf`
  return r
}

export async function generateInvoiceAndESD(opts: ShipmentOpts): Promise<GeneratePdfResult> {
  // ARC-OVI(남아공)는 미국식 ESD(Exempt Specimen Declaration) 불필요 — 인보이스 1장만.
  // (남아공 통관은 VHC_MIP 수의건강증명서로, ARC 팩에서 별도 발급.)
  if ((opts.consignee_lab ?? '').toLowerCase() === 'arc_ovr') {
    return generateInvoice(opts)
  }

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

/**
 * 발송 팩 — 인보이스+ESD 앞장 + 선택한 케이스별 검사 서류 N장을 하나의 PDF 로 병합.
 * 앞장(인보이스+ESD)이 맨 앞. 검사 탭 '신청서' 메뉴(KSVDL-R·KSVDL·VBDDL+APQA HQ·ARC-OVI)에서 사용.
 *  - invoice-only: 인보이스 + ESD + 미국 세관신고서 (KSVDL-R 광견병항체 발송용)
 *  - ksvdl: 인보이스 + ESD + 케이스별 KSVDL 시료제출서
 *  - nz:    인보이스 + ESD + 케이스별 NZ 전염병검사 팩(VBDDL+APQA HQ 국/영)
 *  - arc:   인보이스(ESD 없음, 남아공) + 케이스별 ARC-OVI 팩(시료제출서+VHC+면허)
 * ESD/Customs 분기는 앞장 생성기 generateInvoiceAndESD 가 consignee_lab 기준으로 처리.
 * 인보이스 수신처(consignee_lab)·검체수(tube_count)·발송일(ship_date)은 호출부에서 지정.
 */
export async function generateShipmentPack(params: {
  variant: 'invoice-only' | 'ksvdl' | 'nz' | 'arc'
  caseIds: string[]
  tube_count: number
  consignee_lab: string
  ship_date?: string
  opts?: GenerateOpts
}): Promise<GeneratePdfResult> {
  const { PDFDocument } = await import('pdf-lib')
  // 발송 건당 앞장 서류 — 인보이스 + ESD(해외 발송 세관 통관용 검체 선언서).
  // generateInvoiceAndESD 가 consignee 별 분기를 이미 처리:
  //  - ksvdl_r → 인보이스 + ESD + 미국 세관신고서(Customs)
  //  - ksvdl·vbddl → 인보이스 + ESD
  //  - arc_ovr(남아공) → ESD 불필요, 인보이스만
  const front = await generateInvoiceAndESD({
    tube_count: params.tube_count,
    consignee_lab: params.consignee_lab,
    ship_date: params.ship_date,
  })
  if (!front.ok) return front
  // KSVDL-R 등 invoice-only 는 케이스별 서류가 없으므로 앞장 서류가 곧 발송 팩.
  if (params.variant === 'invoice-only') {
    return { ...front, filename: `${params.consignee_lab}_shipment_${params.tube_count}tubes.pdf` }
  }

  const parts: string[] = [front.pdf]
  for (const caseId of params.caseIds) {
    const r =
      params.variant === 'ksvdl'
        ? await generateKsvdl(caseId, params.opts)
        : params.variant === 'nz'
        ? await generateNzInfectionPack(caseId, params.opts)
        : await generateArcOviPack(caseId, params.opts)
    if (!r.ok) return r
    parts.push(r.pdf)
  }

  const merged = await PDFDocument.create()
  for (const b64 of parts) {
    const doc = await PDFDocument.load(Buffer.from(b64, 'base64'))
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  const pdfBytes = await merged.save()
  return {
    ok: true,
    pdf: Buffer.from(pdfBytes).toString('base64'),
    filename: `${params.consignee_lab}_shipment_${params.tube_count}tubes.pdf`,
  }
}

export async function generateOVD(caseId: string, opts?: GenerateOpts) {
  return generate('OVD', caseId, opts)
}

export async function generateVBC(caseId: string, opts?: GenerateOpts) {
  return generate('VBC', caseId, opts)
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
  // AQS-279 의 "TOTAL NUMBER of DOGS and CATS ARRIVING in HAWAII on that DATE"
  // 는 같은 보호자 + 같은 여행지 + 같은 출국일 케이스 수로 자동 계산.
  // hawaii_extra.total_pets_arriving 가 양의 정수로 입력돼 있으면 그 값을 우선.
  // 다중 여행지: opts.destination 으로 활성 여행지를 받아 sibling 매칭에 by_dest 출국일 사용.
  const activeDest = opts?.destination ?? null
  const sib = await fetchSiblings(caseId, activeDest)
  let totalPets = 1
  if (sib.ok) {
    const pivot = sib.siblings[0]
    const data = (pivot?.data ?? {}) as Record<string, unknown>
    const hawaiiExtra = (data.hawaii_extra as Record<string, unknown> | undefined) ?? {}
    const override = hawaiiExtra.total_pets_arriving
    const overrideNum =
      typeof override === 'number'
        ? override
        : typeof override === 'string' && override.trim() !== ''
          ? Number(override)
          : NaN
    if (Number.isFinite(overrideNum) && overrideNum > 0) {
      totalPets = Math.floor(overrideNum)
    } else {
      const pivotDeparture = getDepartureDate(pivot, activeDest)
      if (pivotDeparture) {
        // fetchSiblings 는 (sameDeparture OR sameVet) 으로 매칭하므로
        // AQS 도착일 카운트는 출국일 일치 건만 다시 좁혀서 카운트.
        totalPets = sib.siblings.filter(c => getDepartureDate(c, activeDest) === pivotDeparture).length || 1
      } else {
        totalPets = sib.siblings.length
      }
    }
  }
  return generate('AQS_279', caseId, { ...opts, extras: { total_pets_arriving: String(totalPets) } })
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
  formKey: 'AnnexIII' | 'UK' | 'NZ' | 'VBC'
}

/**
 * Find cases that share the same customer + destination + departure_date with the given case.
 *
 * 다중 여행지 케이스 + activeDestination 인자가 주어진 경우: 출국일·내원일 비교를
 * `by_dest[activeDestination][departure_date|vet_visit_date]` 기준으로 수행 (top-level
 * column/data fallback). pivot 과 candidate 모두 같은 활성 여행지 컨텍스트로 읽혀야
 * destination 별 분리된 출국일이 다른 경우에도 정확한 sibling 묶음이 잡힌다.
 */
export async function fetchSiblings(caseId: string, activeDestination?: string | null): Promise<
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

  // 1차 필터: 같은 보호자(이메일 우선 + 이름 폴백) + 같은 여행지 (server side).
  // co_progress 트리거와 동일하게 이메일이 있으면 이메일로도 매칭 — 이름 표기가
  // 달라도(영문/한글) 같은 보호자를 잡는다. org_id 명시(인덱스+의도) + 같은 여행지.
  // 이름·이메일 각각 cap 50 (초과는 매우 비정상이라 안전).
  const pEmail = String((p.data as Record<string, unknown> | undefined)?.email ?? '')
    .trim()
    .toLowerCase()
  const baseQuery = () => {
    const base = supabase.from('cases').select('*').eq('org_id', p.org_id)
    return p.destination ? base.eq('destination', p.destination) : base.is('destination', null)
  }
  const { data: byName, error: nameErr } = await baseQuery()
    .eq('customer_name', p.customer_name)
    .limit(50)
  if (nameErr) return { ok: false, error: nameErr.message }
  const candidates = new Map<string, CaseRow>(
    (byName ?? []).map((r) => [(r as CaseRow).id, r as CaseRow]),
  )
  if (pEmail) {
    const { data: byEmail, error: emailErr } = await baseQuery()
      .filter('data->>email', 'eq', pEmail)
      .limit(50)
    if (emailErr) return { ok: false, error: emailErr.message }
    for (const r of byEmail ?? []) candidates.set((r as CaseRow).id, r as CaseRow)
  }
  const rows = [...candidates.values()]

  // 2차 필터: 활성 여행지 기준 출국일 OR 내원일 일치.
  // by_dest 우선, 없으면 column/data fallback — destination-scoped-fields 헬퍼가 처리.
  const pivotDeparture = getDepartureDate(p, activeDestination)
  const pivotVet = getVetVisitDate(p, activeDestination)
  const matchesPivot = (c: CaseRow): boolean => {
    const cDeparture = getDepartureDate(c, activeDestination)
    const cVet = getVetVisitDate(c, activeDestination)
    const sameDeparture = pivotDeparture
      ? cDeparture === pivotDeparture
      : !cDeparture
    const sameVet = pivotVet ? cVet === pivotVet : !cVet
    return sameDeparture || sameVet
  }

  const all = rows
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

export async function previewSiblings(
  caseId: string,
  formKey: 'AnnexIII' | 'UK' | 'NZ' | 'VBC',
  /** 다중 여행지 케이스 — 활성 여행지의 출국일·내원일 기준으로 sibling 매칭. */
  activeDestination?: string | null,
): Promise<
  { ok: true; preview: SiblingPreview } | { ok: false; error: string }
> {
  const r = await fetchSiblings(caseId, activeDestination ?? null)
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

function simulatePackCount(formKey: 'AnnexIII' | 'UK' | 'NZ' | 'VBC', summaries: SiblingSummary[]): number {
  // VBC 는 동물 테이블이 없어 페이지 용량 제한이 없다 — 항상 1장에 모두 들어간다.
  if (formKey === 'VBC') return summaries.length > 0 ? 1 : 0
  const cap =
    formKey === 'AnnexIII' ? { animals: 3, vaccRows: 5 } :
    formKey === 'NZ' ? { animals: 5, vaccRows: 9999 } :
    { animals: 5, vaccRows: 5 }
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
  formKey: 'AnnexIII' | 'UK' | 'NZ' | 'NZ_2' | 'VBC',
  caseIds: string[],
  options?: { includeVet?: boolean; destination?: string | null },
): Promise<GenerateMultiPdfResult> {
  if (caseIds.length === 0) return { ok: false, error: '대상 동물이 없습니다' }
  await loadEffectiveVetInfo()
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('cases').select('*').in('id', caseIds)
  if (error) return { ok: false, error: error.message }
  // Preserve the order of caseIds + 활성 여행지 기준 평탄화.
  const byId = new Map((rows ?? []).map(r => [(r as CaseRow).id, r as CaseRow]))
  const ordered = caseIds
    .map(id => byId.get(id))
    .filter((c): c is CaseRow => !!c)
    .map(c => flattenCaseForDestination(c, options?.destination ?? null))
  if (ordered.length === 0) return { ok: false, error: '대상 동물을 찾을 수 없습니다' }

  const results = await fillPdfMulti(formKey, ordered, options)
  const docs: Array<{ pdf: string; filename: string }> = []
  for (const r of results) {
    if (!r.ok) return { ok: false, error: r.error }
    docs.push({ pdf: r.pdf, filename: r.filename })
  }
  return { ok: true, docs }
}

export async function generateAnnexIIIMulti(caseIds: string[], opts?: { includeVet?: boolean; destination?: string | null }) {
  return generateMulti('AnnexIII', caseIds, opts)
}

export async function generateUKMulti(caseIds: string[], opts?: { includeVet?: boolean; destination?: string | null }) {
  return generateMulti('UK', caseIds, opts)
}

/** VBC 다중 — 같은 보호자의 여러 마리를 한 선언서에. 이름·품종을 ', ' 로 join. */
export async function generateVBCMulti(caseIds: string[], opts?: { includeVet?: boolean; destination?: string | null }) {
  return generateMulti('VBC', caseIds, opts)
}

/**
 * NZ 다중 — primary(첫 케이스)의 광견병 접종 횟수로 NZ vs NZ_2 템플릿 선택.
 * 한 인증서에는 동일한 (10a)/(10b) 룰이 적용되므로, 같이 묶인 케이스들의 광견병
 * 이력은 primary 기준만 출력된다 (Cert A 의 다른 백신/검사 행도 모두 primary 기준).
 * UI 가 같은 보호자·여행지·출국일 또는 내원일 케이스를 사전 필터하므로 보통은
 * primary 이력으로 대표가 충분하다.
 */
export async function generateNZMulti(caseIds: string[], opts?: { includeVet?: boolean; destination?: string | null }): Promise<GenerateMultiPdfResult> {
  if (caseIds.length === 0) return { ok: false, error: '대상 동물이 없습니다' }
  const supabase = await createClient()
  const { data: primary } = await supabase
    .from('cases')
    .select('data')
    .eq('id', caseIds[0])
    .single()
  const dates = ((primary?.data as Record<string, unknown> | undefined)?.rabies_dates ?? []) as unknown[]
  const formKey: 'NZ' | 'NZ_2' = Array.isArray(dates) && dates.length >= 2 ? 'NZ_2' : 'NZ'
  return generateMulti(formKey, caseIds, opts)
}

// Legacy single-case entry points — kept for non-multi destinations that still use fillPdf.
// Annex/UK should prefer previewSiblings + generate*Multi.
export async function generateAnnexIII(caseId: string) {
  return generate('AnnexIII', caseId)
}

export async function generateUK(caseId: string) {
  return generate('UK', caseId)
}
