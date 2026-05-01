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
  /** 별지 25호 (3슬롯) / 별지 25 EX (2슬롯) 의 dedicated 광견병 슬롯 선택. sortedAsc 기준 인덱스. */
  rabiesIndices?: number[]
}

export type MultiPdfRequest = {
  kind: 'multi'
  formKey: 'AnnexIII' | 'UK'
  caseIds: string[]
  part?: number
}

export type ShipmentPdfRequest = {
  kind: 'shipment'
  variant: 'invoice' | 'esd' | 'invoice-esd'
  tube_count: number
  consignee_lab?: string
  /** ESD 종 표기. 미지정 시 ['dog']. */
  species?: ('dog' | 'cat')[]
}

export type BundlePdfRequest = {
  kind: 'bundle'
  variant: 'nz-infection-pack'
  caseId: string
  includeSignature?: boolean
  destination?: string | null
}

export type PdfDownloadRequest =
  | SinglePdfRequest
  | MultiPdfRequest
  | ShipmentPdfRequest
  | BundlePdfRequest

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
