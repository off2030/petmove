import { convertToPixelCrop, type PercentCrop } from 'react-image-crop'

/** Percent coordinates stay correct when a mobile image is scaled or the viewport rotates. */
export async function cropImageToBlob(img: HTMLImageElement, crop: PercentCrop): Promise<Blob> {
  const { x, y, width, height } = convertToPixelCrop(crop, img.naturalWidth, img.naturalHeight)
  if (width <= 0 || height <= 0) throw new Error('자를 영역을 선택해 주세요.')

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트 생성 실패')
  ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas → blob 실패'))),
      'image/jpeg',
      0.92,
    )
  })
}
