/**
 * 파일(이미지/PDF)을 AI 추출용 base64 이미지로 변환하는 공통 유틸.
 * - 이미지: canvas 리사이즈 후 JPEG base64
 * - PDF: pdfjs-dist로 페이지별 JPEG base64
 */

import { pdfToImages, pdfToText } from './pdf-to-images'

const MAX_PX = 1200
const JPEG_QUALITY = 0.85

/** 이미지가 AI 추출 가능한 파일인지 확인 */
export function isExtractableFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'application/pdf'
}

/** 단일 이미지 파일을 base64로 변환 (canvas 리사이즈) */
export function imageToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > MAX_PX || h > MAX_PX) {
        const ratio = Math.min(MAX_PX / w, MAX_PX / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 파일 목록을 AI 추출용 base64 이미지 배열로 변환.
 * 이미지 파일은 그대로, PDF는 페이지별로 분리.
 * 지원하지 않는 파일은 건너뛴다.
 */
export async function filesToBase64(
  files: File[],
): Promise<{ base64: string; mediaType: string }[]> {
  const results: { base64: string; mediaType: string }[] = []
  for (const file of files) {
    if (file.type === 'application/pdf') {
      const pages = await pdfToImages(file)
      results.push(...pages)
    } else if (file.type.startsWith('image/')) {
      results.push(await imageToBase64(file))
    }
  }
  return results
}

/**
 * 파일 목록 중 PDF 들의 selectable text 레이어를 추출해 파일별로 모은다.
 * 텍스트 레이어가 없거나 짧은 PDF (스캔본) 는 결과에서 자동 제외된다.
 * vision OCR 입력에 함께 곁들여 모델이 작은 글자도 정확히 읽도록 돕는 용도.
 */
export async function filesToPdfText(files: File[]): Promise<string[]> {
  const texts: string[] = []
  for (const file of files) {
    if (file.type !== 'application/pdf') continue
    try {
      const t = await pdfToText(file)
      if (t) texts.push(`# ${file.name}\n${t}`)
    } catch {
      // 텍스트 레이어 추출 실패는 조용히 무시 — vision OCR 폴백
    }
  }
  return texts
}
