'use client'

import { lazy, Suspense, useRef, useState } from 'react'
import { Scan } from 'lucide-react'
import { cn } from '@/lib/utils'

const ScanFlow = lazy(() =>
  import('@/lib/scanner/scan-flow').then((m) => ({ default: m.ScanFlow })),
)

interface ScanButtonProps {
  onScanned: (file: File) => void
  disabled?: boolean
  title?: string
  className?: string
}

/**
 * 모바일 환경에서만 노출되는 스캔 버튼.
 * 카메라로 직접 촬영 → jscanify 자동 모서리 검출/원근 보정 → File 콜백.
 */
export function ScanButton({
  onScanned,
  disabled,
  title = '스캔',
  className,
}: ScanButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<File | null>(null)

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setSource(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        title={title}
        aria-label={title}
        className={cn(
          'md:hidden shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30',
          className,
        )}
      >
        <Scan size={16} />
      </button>
      {source && (
        <Suspense fallback={null}>
          <ScanFlow
            source={source}
            onClose={() => setSource(null)}
            onConfirm={(file) => {
              onScanned(file)
              setSource(null)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
