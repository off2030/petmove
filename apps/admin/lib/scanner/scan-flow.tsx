'use client'

/**
 * 모바일 이미지 첨부 시 표시되는 자르기(crop) 모달.
 *
 * 이전 버전은 jscanify + OpenCV 로 4점 자유 사각형 + 원근 보정. 너무 무겁고
 * (~5MB OpenCV wasm) 자동검출이 자주 빗나가 사용자 불편. 일반적인 직사각형
 * 크롭으로 단순화.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area } from 'react-easy-crop'
import { Check, Loader2, X } from 'lucide-react'

interface ScanFlowProps {
  source: File
  onConfirm: (file: File) => void
  onClose: () => void
}

export function ScanFlow({ source, onConfirm, onClose }: ScanFlowProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const url = URL.createObjectURL(source)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setCroppedAreaPixels(areaPx)
  }, [])

  async function handleConfirm() {
    if (!imageUrl || !croppedAreaPixels) return
    setProcessing(true)
    try {
      const blob = await cropImageToBlob(imageUrl, croppedAreaPixels)
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
          disabled={processing || !croppedAreaPixels}
          aria-label="확인"
          className="rounded-full p-2 hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          {processing ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} />}
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
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
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
            showGrid
            restrictPosition={false}
          />
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
 * 원본 이미지에서 픽셀 영역을 잘라 jpeg blob 으로 반환.
 */
async function cropImageToBlob(imageUrl: string, area: Area): Promise<Blob> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'))
    img.src = imageUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width))
  canvas.height = Math.max(1, Math.round(area.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트 생성 실패')
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas → blob 실패'))),
      'image/jpeg',
      0.92,
    )
  })
}
