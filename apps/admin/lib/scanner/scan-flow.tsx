'use client'

/**
 * 모바일 이미지 첨부 시 표시되는 자르기(crop) 모달.
 *
 * react-image-crop — 박스 코너/엣지 손잡이로 자유롭게 크기·위치 조정.
 * 세로 문서·가로 영수증 등 어떤 비율이든 사용자가 맞출 수 있음.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Check, Loader2, X } from 'lucide-react'

interface ScanFlowProps {
  source: File
  onConfirm: (file: File) => void
  onClose: () => void
}

export function ScanFlow({ source, onConfirm, onClose }: ScanFlowProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const url = URL.createObjectURL(source)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    // 기본 크롭 박스 — 이미지 중앙 80% 영역.
    const initial: Crop = {
      unit: '%',
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    }
    setCrop(initial)
    setCompletedCrop({
      unit: 'px',
      x: naturalWidth * 0.1,
      y: naturalHeight * 0.1,
      width: naturalWidth * 0.8,
      height: naturalHeight * 0.8,
    })
  }

  async function handleConfirm() {
    if (!imageUrl || !completedCrop || !imgRef.current) return
    setProcessing(true)
    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop)
      const baseName = source.name.replace(/\.[^.]+$/, '') || 'crop'
      const file = new File([blob], `${baseName}_crop.jpg`, { type: 'image/jpeg' })
      onConfirm(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProcessing(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between h-14 px-2 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="취소"
          className="rounded-full p-2 hover:bg-white/10 transition-colors"
        >
          <X size={22} />
        </button>
        <span className="text-sm font-medium">이미지 자르기</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0}
          aria-label="확인"
          className="rounded-full p-2 hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          {processing ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} />}
        </button>
      </div>

      <div className="flex-1 relative overflow-auto bg-black flex items-center justify-center p-2">
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center text-white">
            <span className="text-sm">{error}</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              닫기
            </button>
          </div>
        )}
        {imageUrl && !error && (
          <ReactCrop
            crop={crop}
            onChange={(_, percent) => setCrop(percent)}
            onComplete={(c) => setCompletedCrop(c)}
            keepSelection
            ruleOfThirds
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              onLoad={onImageLoad}
              className="max-h-[calc(100vh-7rem)] max-w-full select-none"
            />
          </ReactCrop>
        )}
      </div>

      {/* 원본 사용 — ScanFlow 우회. */}
      <div className="flex items-center justify-center gap-3 h-14 px-4 text-white/80 text-xs">
        <button
          type="button"
          onClick={() => onConfirm(source)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10 transition-colors"
        >
          원본 사용
        </button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 화면에 렌더된 이미지에서 표시 좌표(crop)를 자연 픽셀 좌표로 변환해 잘라냄.
 */
async function cropImageToBlob(img: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  const sx = crop.x * scaleX
  const sy = crop.y * scaleY
  const sw = crop.width * scaleX
  const sh = crop.height * scaleY

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트 생성 실패')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas → blob 실패'))),
      'image/jpeg',
      0.92,
    )
  })
}
