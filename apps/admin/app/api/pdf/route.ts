import { NextRequest, NextResponse } from 'next/server'
import {
  generateAQS,
  generateAnnexIIIMulti,
  generateApqaHq,
  generateApqaHqEn,
  generateAU,
  generateAU2,
  generateAUCat,
  generateAUCat2,
  generateCH,
  generateESD,
  generateForm25,
  generateForm25AuNz,
  generateFormAC,
  generateFormR11,
  generateFormRE,
  generateIdentificationDeclaration,
  generateInvoice,
  generateInvoiceAndESD,
  generateKsvdl,
  generateNZ,
  generateNzInfectionPack,
  generateOVD,
  generateSGP,
  generateUKMulti,
  generateVbddl,
  generateVHC,
} from '@/lib/actions/generate-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SinglePdfBody = {
  kind: 'single'
  formKey:
    | 'Form25'
    | 'Form25AuNz'
    | 'FormRE'
    | 'FormAC'
    | 'IdentificationDeclaration'
    | 'AU'
    | 'AU_2'
    | 'AU_Cat'
    | 'AU_Cat_2'
    | 'NZ'
    | 'OVD'
    | 'SGP'
    | 'AQS_279'
    | 'CH'
    | 'Form_R11'
    | 'VHC'
    | 'APQA_HQ'
    | 'APQA_HQ_En'
    | 'KSVDL'
    | 'VBDDL'
  caseId: string
  includeSignature?: boolean
  destination?: string | null
}

type MultiPdfBody = {
  kind: 'multi'
  formKey: 'AnnexIII' | 'UK'
  caseIds: string[]
  part?: number
}

type ShipmentPdfBody = {
  kind: 'shipment'
  variant: 'invoice' | 'esd' | 'invoice-esd'
  tube_count: number
  consignee_lab?: string
}

type BundlePdfBody = {
  kind: 'bundle'
  variant: 'nz-infection-pack'
  caseId: string
  includeSignature?: boolean
  destination?: string | null
}

type PdfRequestBody = SinglePdfBody | MultiPdfBody | ShipmentPdfBody | BundlePdfBody

const SINGLE_GENERATORS = {
  Form25: generateForm25,
  Form25AuNz: generateForm25AuNz,
  FormRE: generateFormRE,
  FormAC: generateFormAC,
  IdentificationDeclaration: generateIdentificationDeclaration,
  AU: generateAU,
  AU_2: generateAU2,
  AU_Cat: generateAUCat,
  AU_Cat_2: generateAUCat2,
  NZ: generateNZ,
  OVD: generateOVD,
  SGP: generateSGP,
  AQS_279: generateAQS,
  CH: generateCH,
  Form_R11: generateFormR11,
  VHC: generateVHC,
  APQA_HQ: generateApqaHq,
  APQA_HQ_En: generateApqaHqEn,
  KSVDL: generateKsvdl,
  VBDDL: generateVbddl,
} as const

function jsonError(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status })
}

function pdfResponse(
  base64: string,
  filename: string,
  extraHeaders?: Record<string, string>,
) {
  const bytes = Buffer.from(base64, 'base64')
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store, max-age=0',
      ...(extraHeaders ?? {}),
    },
  })
}

export async function POST(req: NextRequest) {
  let body: PdfRequestBody
  try {
    body = await req.json()
  } catch {
    return jsonError('잘못된 요청 본문입니다.', 400)
  }

  try {
    if (body.kind === 'single') {
      const generate = SINGLE_GENERATORS[body.formKey]
      if (!generate) return jsonError(`지원하지 않는 양식입니다: ${body.formKey}`, 400)
      const result = await generate(body.caseId, {
        includeSignature: body.includeSignature,
        destination: body.destination,
      })
      if (!result.ok) return jsonError(result.error, 500)
      return pdfResponse(result.pdf, result.filename)
    }

    if (body.kind === 'shipment') {
      const opts = {
        tube_count: body.tube_count,
        consignee_lab: body.consignee_lab,
      }
      const result =
        body.variant === 'invoice'
          ? await generateInvoice(opts)
          : body.variant === 'esd'
          ? await generateESD(opts)
          : await generateInvoiceAndESD(opts)
      if (!result.ok) return jsonError(result.error, 500)
      return pdfResponse(result.pdf, result.filename)
    }

    if (body.kind === 'bundle') {
      const result = await generateNzInfectionPack(body.caseId, {
        includeSignature: body.includeSignature,
        destination: body.destination,
      })
      if (!result.ok) return jsonError(result.error, 500)
      return pdfResponse(result.pdf, result.filename)
    }

    if (body.kind === 'multi') {
      if (!Array.isArray(body.caseIds) || body.caseIds.length === 0) {
        return jsonError('선택된 케이스가 없습니다.', 400)
      }
      const result =
        body.formKey === 'AnnexIII'
          ? await generateAnnexIIIMulti(body.caseIds)
          : await generateUKMulti(body.caseIds)
      if (!result.ok) return jsonError(result.error, 500)
      if (result.docs.length === 0) return jsonError('생성된 문서가 없습니다.', 500)

      const requestedPart = body.part ?? 1
      if (requestedPart < 1 || requestedPart > result.docs.length) {
        return jsonError('요청한 문서 파트가 범위를 벗어났습니다.', 400, {
          partCount: result.docs.length,
        })
      }

      const doc = result.docs[requestedPart - 1]
      return pdfResponse(doc.pdf, doc.filename, {
        'X-Pdf-Part-Count': String(result.docs.length),
        'X-Pdf-Part': String(requestedPart),
      })
    }

    return jsonError('지원하지 않는 요청입니다.', 400)
  } catch (error) {
    console.error('[api/pdf] unexpected error:', error)
    return jsonError(error instanceof Error ? error.message : 'PDF 생성 중 오류가 발생했습니다.', 500)
  }
}
