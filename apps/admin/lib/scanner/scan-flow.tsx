'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, RotateCcw, X } from 'lucide-react'
import { loadOpenCv } from './load-opencv'

interface Corner {
  x: number
  y: number
}

interface Corners {
  topLeftCorner: Corner
  topRightCorner: Corner
  bottomLeftCorner: Corner
  bottomRightCorner: Corner
}

type CornerKey = keyof Corners
const CORNER_KEYS: CornerKey[] = [
  'topLeftCorner',
  'topRightCorner',
  'bottomRightCorner',
  'bottomLeftCorner',
]

type Stage = 'loading' | 'adjust' | 'processing' | 'error'

interface ScanFlowProps {
  source: File
  onConfirm: (file: File) => void
  onClose: () => void
}

interface JscanifyInstance {
  findPaperContour: (img: unknown) => unknown
  getCornerPoints: (contour: unknown, img?: unknown) => Corners
  extractPaper: (
    image: HTMLImageElement | HTMLCanvasElement,
    width: number,
    height: number,
    cornerPoints?: Corners,
  ) => HTMLCanvasElement | null
}

async function loadJscanify(): Promise<new () => JscanifyInstance> {
  const mod = (await import('jscanify/client')) as unknown as {
    default?: new () => JscanifyInstance
  }
  if (mod.default) return mod.default
  const fromGlobal = (window as unknown as { jscanify?: new () => JscanifyInstance }).jscanify
  if (fromGlobal) return fromGlobal
  throw new Error('jscanify 모듈 로드 실패')
}

function fallbackCorners(width: number, height: number): Corners {
  const inset = Math.min(width, height) * 0.05
  return {
    topLeftCorner: { x: inset, y: inset },
    topRightCorner: { x: width - inset, y: inset },
    bottomRightCorner: { x: width - inset, y: height - inset },
    bottomLeftCorner: { x: inset, y: height - inset },
  }
}

function isValidCorners(c: Corners | null | undefined): c is Corners {
  if (!c) return false
  return CORNER_KEYS.every(
    (k) =>
      c[k] &&
      typeof c[k].x === 'number' &&
      typeof c[k].y === 'number' &&
      Number.isFinite(c[k].x) &&
      Number.isFinite(c[k].y),
  )
}

/**
 * 검출된 4점의 bounding box 가 이미지의 일정 비율 이상을 차지해야 의미있는
 * 검출. jscanify 가 이상한 작은 영역(다른 종이 조각, 그림자 등)을 잡으면
 * 4점이 좁게 뭉치는데, fullback (이미지 전체) 으로 돌려 사용자가 직접
 * 모서리를 잡도록 유도.
 */
function isReasonableQuad(c: Corners, imgW: number, imgH: number): boolean {
  const xs = CORNER_KEYS.map((k) => c[k].x)
  const ys = CORNER_KEYS.map((k) => c[k].y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  // 가로·세로 모두 이미지의 25% 이상 차지해야 인정.
  return w >= imgW * 0.25 && h >= imgH * 0.25
}

export function ScanFlow({ source, onConfirm, onClose }: ScanFlowProps) {
  const [stage, setStage] = useState<Stage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [corners, setCorners] = useState<Corners | null>(null)
  const [autoCorners, setAutoCorners] = useState<Corners | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let canceled = false

    async function run() {
      try {
        const url = URL.createObjectURL(source)
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'))
          img.src = url
        })
        if (canceled) return

        await loadOpenCv()
        if (canceled) return
        const Jscanify = await loadJscanify()
        const scanner = new Jscanify()

        const cv = (window as unknown as { cv: { imread: (img: HTMLImageElement) => { delete: () => void } } }).cv
        const mat = cv.imread(img)
        let detected: Corners | null = null
        try {
          const contour = scanner.findPaperContour(mat)
          if (contour) {
            detected = scanner.getCornerPoints(contour, mat)
          }
        } catch {
          detected = null
        } finally {
          mat.delete()
        }

        if (
          !isValidCorners(detected) ||
          !isReasonableQuad(detected, img.naturalWidth, img.naturalHeight)
        ) {
          detected = fallbackCorners(img.naturalWidth, img.naturalHeight)
        }

        if (canceled) return
        setImgEl(img)
        setCorners(detected)
        setAutoCorners(detected)
        setStage('adjust')
      } catch (e) {
        if (canceled) return
        setError(e instanceof Error ? e.message : String(e))
        setStage('error')
      }
    }

    run()
    return () => {
      canceled = true
    }
  }, [source])

  async function handleConfirm() {
    if (!imgEl || !corners) return
    setStage('processing')
    try {
      const Jscanify = await loadJscanify()
      const scanner = new Jscanify()
      const widthTop = Math.hypot(
        corners.topRightCorner.x - corners.topLeftCorner.x,
        corners.topRightCorner.y - corners.topLeftCorner.y,
      )
      const widthBot = Math.hypot(
        corners.bottomRightCorner.x - corners.bottomLeftCorner.x,
        corners.bottomRightCorner.y - corners.bottomLeftCorner.y,
      )
      const heightL = Math.hypot(
        corners.bottomLeftCorner.x - corners.topLeftCorner.x,
        corners.bottomLeftCorner.y - corners.topLeftCorner.y,
      )
      const heightR = Math.hypot(
        corners.bottomRightCorner.x - corners.topRightCorner.x,
        corners.bottomRightCorner.y - corners.topRightCorner.y,
      )
      const outW = Math.max(64, Math.round(Math.max(widthTop, widthBot)))
      const outH = Math.max(64, Math.round(Math.max(heightL, heightR)))

      const canvas = scanner.extractPaper(imgEl, outW, outH, corners)
      if (!canvas) throw new Error('보정 실패: 결과 이미지 없음')

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas → blob 실패'))),
          'image/jpeg',
          0.92,
        )
      })

      const baseName = source.name.replace(/\.[^.]+$/, '') || 'scan'
      const file = new File([blob], `${baseName}_scan.jpg`, { type: 'image/jpeg' })
      onConfirm(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  function handleReset() {
    if (autoCorners) setCorners(autoCorners)
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
        <span className="text-sm font-medium">문서 스캔</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={stage !== 'adjust'}
          aria-label="확인"
          className="rounded-full p-2 hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          <Check size={22} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {(stage === 'loading' || stage === 'processing') && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm text-white/80">
              {stage === 'loading' ? '문서 인식 중…' : '보정 중…'}
            </span>
          </div>
        )}
        {stage === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
            <span className="text-sm">{error || '오류가 발생했습니다'}</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              닫기
            </button>
          </div>
        )}
        {stage === 'adjust' && imgEl && corners && (
          <CornerEditor img={imgEl} corners={corners} onChange={setCorners} />
        )}
      </div>

      {stage === 'adjust' && (
        <div className="flex items-center justify-center gap-3 h-14 px-4 text-white/80 text-xs">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10 transition-colors"
          >
            <RotateCcw size={14} />
            자동 인식 위치로
          </button>
          <button
            type="button"
            onClick={() => onConfirm(source)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10 transition-colors"
          >
            원본 사용
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

interface CornerEditorProps {
  img: HTMLImageElement
  corners: Corners
  onChange: (c: Corners) => void
}

function CornerEditor({ img, corners, onChange }: CornerEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    function compute() {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const naturalRatio = img.naturalWidth / img.naturalHeight
      const containerRatio = rect.width / rect.height
      let drawnW: number
      let drawnH: number
      if (naturalRatio > containerRatio) {
        drawnW = rect.width
        drawnH = rect.width / naturalRatio
      } else {
        drawnH = rect.height
        drawnW = rect.height * naturalRatio
      }
      const offsetX = (rect.width - drawnW) / 2
      const offsetY = (rect.height - drawnH) / 2
      setLayout({
        width: drawnW,
        height: drawnH,
        offsetX,
        offsetY,
        scale: drawnW / img.naturalWidth,
      })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [img])

  const draggingRef = useRef<CornerKey | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  function pointerToImage(clientX: number, clientY: number): Corner | null {
    const el = containerRef.current
    if (!el || layout.scale === 0) return null
    const rect = el.getBoundingClientRect()
    const x = (clientX - rect.left - layout.offsetX) / layout.scale
    const y = (clientY - rect.top - layout.offsetY) / layout.scale
    const clampedX = Math.max(0, Math.min(img.naturalWidth, x))
    const clampedY = Math.max(0, Math.min(img.naturalHeight, y))
    return { x: clampedX, y: clampedY }
  }

  function onPointerDown(key: CornerKey) {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = key
      pointerIdRef.current = e.pointerId
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
    e.preventDefault()
    const next = pointerToImage(e.clientX, e.clientY)
    if (!next) return
    onChange({ ...corners, [draggingRef.current]: next })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return
    draggingRef.current = null
    pointerIdRef.current = null
  }

  const sx = (x: number) => layout.offsetX + x * layout.scale
  const sy = (y: number) => layout.offsetY + y * layout.scale

  const polygonPoints = CORNER_KEYS
    .map((k) => `${sx(corners[k].x)},${sy(corners[k].y)}`)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src={img.src}
        alt="scan source"
        draggable={false}
        className="absolute pointer-events-none"
        style={{
          left: layout.offsetX,
          top: layout.offsetY,
          width: layout.width,
          height: layout.height,
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points={polygonPoints}
          fill="rgba(96, 165, 250, 0.15)"
          stroke="rgb(96, 165, 250)"
          strokeWidth={2}
        />
      </svg>
      {CORNER_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onPointerDown={onPointerDown(k)}
          aria-label={`corner-${k}`}
          className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-400 bg-blue-400/30 backdrop-blur-sm active:bg-blue-400/60"
          style={{
            left: sx(corners[k].x),
            top: sy(corners[k].y),
            touchAction: 'none',
          }}
        />
      ))}
    </div>
  )
}
