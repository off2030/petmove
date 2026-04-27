/**
 * PDF 파일을 페이지별 JPEG base64 이미지로 변환한다.
 * pdfjs-dist의 canvas 렌더링을 사용.
 *
 * 추가로 `pdfToText` 는 PDF 의 selectable text 레이어를 직접 뽑아낸다 — 텍스트 레이어가
 * 살아있으면 OCR 없이 100% 정확한 텍스트를 얻을 수 있어, vision API 입력에 같이 곁들이면
 * 추출 정확도가 크게 오른다. 스캔 이미지만 든 PDF 는 빈 문자열 반환.
 */

const MAX_PX = 1200
const JPEG_QUALITY = 0.85

export async function pdfToImages(
  file: File,
): Promise<{ base64: string; mediaType: string }[]> {
  // SSR에서 DOMMatrix 참조 폭발을 피하기 위해 동적 import
  const pdfjsLib = await import('pdfjs-dist')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const results: { base64: string; mediaType: string }[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    // 기본 viewport에서 스케일 계산
    const vp = page.getViewport({ scale: 1 })
    const longestSide = Math.max(vp.width, vp.height)
    const scale = longestSide > MAX_PX ? MAX_PX / longestSide : 1
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    results.push({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
  }

  return results
}

/**
 * PDF 의 텍스트 레이어를 페이지별로 추출해 한 문자열로 합친다.
 * - 텍스트 레이어가 있으면 페이지 사이를 `--- PAGE BREAK ---` 로 구분해 반환.
 * - 스캔 PDF 등 텍스트가 없거나 짧으면 빈 문자열 반환 (호출 측에서 fallback 처리).
 */
export async function pdfToText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const lineParts: string[] = []
    for (const it of tc.items) {
      if ('str' in it && typeof it.str === 'string') {
        lineParts.push(it.str)
        if ('hasEOL' in it && (it as { hasEOL?: boolean }).hasEOL) lineParts.push('\n')
      }
    }
    pages.push(lineParts.join(' ').replace(/\s+\n/g, '\n').trim())
  }
  const merged = pages.filter(Boolean).join('\n\n--- PAGE BREAK ---\n\n')
  // 너무 짧으면 (스캔 PDF 추정) 빈 문자열로 — 호출 측이 vision-only 폴백 가능
  return merged.length < 30 ? '' : merged
}
