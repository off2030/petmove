/**
 * PDF 파일을 페이지별 JPEG base64 이미지로 변환한다.
 * pdfjs-dist의 canvas 렌더링을 사용.
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
