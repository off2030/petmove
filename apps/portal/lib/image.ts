/**
 * 이미지 클라이언트 압축 — 보호자 아바타 등 작은 사진용.
 *
 * 사용자가 카메라/갤러리로 고른 이미지를 max 변(예: 400px) 안에 맞춰 비율 유지 resize 하고
 * JPEG 으로 압축해 Blob 반환. 원본 파일을 그대로 업로드하면 모바일 사진 (수 MB)이 user-avatars
 * bucket 의 5MB 한도를 넘기거나 portal/admin 의 표시 영역(52px)에 비해 과대.
 */
export async function resizeImage(
  file: File,
  maxSize = 400,
  quality = 0.85,
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const { width, height } = fitInto(img.width, img.height, maxSize)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context 를 만들 수 없습니다.')
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('이미지 변환에 실패했습니다.'))
        },
        'image/jpeg',
        quality,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
    img.src = src
  })
}

function fitInto(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  if (w >= h) return { width: max, height: Math.round((h / w) * max) }
  return { width: Math.round((w / h) * max), height: max }
}
