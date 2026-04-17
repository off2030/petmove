/**
 * PDF 파일을 페이지별 JPEG base64 이미지로 변환한다.
 * pdfjs-dist의 canvas 렌더링을 사용.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Worker 설정 (Next.js 환경에서 static import 불가하므로 CDN 사용하지 않고 inline)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

const MAX_PX = 1200
const JPEG_QUALITY = 0.85

export async function pdfToImages(
  file: File,
): Promise<{ base64: string; mediaType: string }[]> {
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
