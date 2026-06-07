/**
 * 이미지 파일을 중앙 정사각형으로 크롭한 뒤 지정 크기 JPEG Blob 으로 변환.
 * 브라우저(canvas) 전용 — 클라이언트 컴포넌트에서만 호출할 것.
 *
 * 프로필 이미지(profile-section)·조직 아바타(company-section) 업로드 공용.
 */
export async function resizeSquareJpeg(
  file: File,
  targetPx = 512,
  quality = 0.9,
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = targetPx
    canvas.height = targetPx
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D 미지원 브라우저')
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetPx, targetPx)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))),
        'image/jpeg',
        quality,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
