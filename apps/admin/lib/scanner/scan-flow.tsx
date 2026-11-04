'use client'

/**
 * 모바일 이미지 첨부 시 표시되는 자르기(crop) 모달.
 *
 * react-image-crop — 박스 코너/엣지 손잡이로 자유롭게 크기·위치 조정.
 * 세로 문서·가로 영수증 등 어떤 비율이든 사용자가 맞출 수 있음.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Check, Loader2, X } from 'lucide-react'
import { cropImageToBlob } from './crop-image'

interface ScanFlowProps {
  source: File
  onConfirm: (file: File) => void
  onClose: () => void
}

export function ScanFlow({ source, onConfirm, onClose }: ScanFlowProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<PercentCrop>()
  const [completedCrop, setCompletedCrop] = useState<PercentCrop | null>(null)
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

  function selectWholeImage() {
    // 처음부터 서류 가장자리를 잘라내지 않는다. 손잡이로 필요한 영역만 줄인다.
    const initial: PercentCrop = {
      unit: '%',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }
    setCrop(initial)
    setCompletedCrop(initial)
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
      role="dialog"
      aria-modal="true"
      aria-label="이미지 자르기"
      className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-black"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between h-14 px-2 text-white">
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

      <p className="shrink-0 px-4 py-2 text-center text-xs text-white/80">
        네 모서리를 끌어 자를 영역을 정하고, 박스 안을 끌어 위치를 옮기세요.
      </p>
      <div className="min-h-0 flex-1 relative overflow-auto bg-black flex items-center justify-center p-4">
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
            onComplete={(_, percent) => setCompletedCrop(percent)}
            keepSelection
            ruleOfThirds
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              onLoad={selectWholeImage}
              onError={() => setError('이미지를 불러오지 못했어요. 원본 사용을 선택하거나 다른 이미지를 첨부해 주세요.')}
              className="max-h-[calc(100dvh-11rem)] max-w-full select-none"
            />
          </ReactCrop>
        )}
      </div>

      {/* 원본 사용 — ScanFlow 우회. */}
      <div className="flex shrink-0 items-center justify-center gap-3 h-14 px-4 text-white/80 text-xs">
        <button
          type="button"
          onClick={selectWholeImage}
          disabled={processing || !completedCrop}
          className="rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10 disabled:opacity-30"
        >
          전체 선택
        </button>
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
