export type SinglePdfRequest = {
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
    | 'TW'
    | 'AQS_279'
    | 'CH'
    | 'Form_R11'
    | 'VHC'
    | 'APQA_HQ'
    | 'APQA_HQ_En'
    | 'APQA_HQ_EU'
    | 'KSVDL'
    | 'VBDDL'
    | 'ARC-OVI'
    | 'VHC_MIP'
    | 'VetLicense_ZA'
  caseId: string
  includeSignature?: boolean
  includeVet?: boolean
  destination?: string | null
  /** 별지 25호 (3슬롯) / 별지 25 EX (2슬롯) 의 dedicated 광견병 슬롯 선택. sortedAsc 기준 인덱스. */
  rabiesIndices?: number[]
}

export type MultiPdfRequest = {
  kind: 'multi'
  formKey: 'AnnexIII' | 'UK' | 'NZ' | 'VBC'
  caseIds: string[]
  part?: number
  includeVet?: boolean
  /** 다중 목적지 케이스에서 활성 목적지 토큰 — by_dest 평탄화에 사용. */
  destination?: string | null
}

export type ShipmentPdfRequest = {
  kind: 'shipment'
  variant: 'invoice' | 'esd' | 'invoice-esd'
  tube_count: number
  consignee_lab?: string
  /** ESD 종 표기. 미지정 시 ['dog']. */
  species?: ('dog' | 'cat')[]
  /** 발송일(Date of Exportation, YYYY-MM-DD). 채혈일에 맞춰 미리 발급 시 지정. 미지정 시 오늘. */
  ship_date?: string
}

export type BundlePdfRequest = {
  kind: 'bundle'
  variant: 'nz-infection-pack' | 'arc-ovi-pack'
  caseId: string
  includeSignature?: boolean
  includeVet?: boolean
  destination?: string | null
}

/** 발송 팩 — 인보이스(맨 앞) + 선택 케이스별 검사 서류 병합. 검사 탭 '신청서' 메뉴. */
export type ShipmentPackRequest = {
  kind: 'shipment-pack'
  variant: 'invoice-only' | 'ksvdl' | 'nz' | 'arc'
  caseIds: string[]
  tube_count: number
  consignee_lab: string
  ship_date?: string
}

export type PdfDownloadRequest =
  | SinglePdfRequest
  | MultiPdfRequest
  | ShipmentPdfRequest
  | BundlePdfRequest
  | ShipmentPackRequest

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) return decodeURIComponent(utf8[1])
  const plain = disposition.match(/filename="?([^"]+)"?/i)
  return plain?.[1] ?? null
}

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) return data.error
    } catch {
      return 'PDF 다운로드 중 오류가 발생했습니다.'
    }
  }
  const text = await res.text().catch(() => '')
  return text || 'PDF 다운로드 중 오류가 발생했습니다.'
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadPdfRequest(request: PdfDownloadRequest): Promise<void> {
  const res = await fetch('/api/pdf', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res))
  }

  const blob = await res.blob()
  const filename = parseFilename(res.headers.get('content-disposition')) ?? 'document.pdf'
  triggerBlobDownload(blob, filename)
}

export async function downloadMultipartPdfRequest(
  request: Omit<MultiPdfRequest, 'part'>,
  partCount: number,
): Promise<void> {
  for (let part = 1; part <= partCount; part++) {
    await downloadPdfRequest({ ...request, part })
  }
}
