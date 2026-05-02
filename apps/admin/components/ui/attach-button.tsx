'use client'

import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

const ScanFlow = lazy(() =>
  import('@/lib/scanner/scan-flow').then((m) => ({ default: m.ScanFlow })),
)

interface AttachButtonProps {
  /** 선택된 파일 — 이미지면 (모바일 한정) ScanFlow 통과 후 호출됨. */
  onFile: (file: File) => void
  /** input accept — 기본 모든 파일. 이미지만 받으려면 "image/*". */
  accept?: string
  /** 다중 선택 허용 (이미지면 여러개 모두 ScanFlow 거치진 않고, 첫 장만 통과). */
  multiple?: boolean
  disabled?: boolean
  title?: string
  className?: string
  /** 기본 Paperclip 아이콘 대신 다른 children. */
  children?: ReactNode
}

/**
 * 파일 첨부 버튼 — 모바일에서 이미지 선택 시 자동 ScanFlow (자동 모서리 검출
 * + 크롭) → 사용자가 확인 또는 "원본 사용" 클릭 후 콜백.
 *
 * - 비이미지(PDF 등) 또는 데스크톱 이미지: ScanFlow 우회, 그대로 onFile.
 * - 다중 선택 시: 이미지 한 장만 ScanFlow, 나머지는 그대로 onFile 직통.
 */
export function AttachButton({
  onFile,
  accept,
  multiple,
  disabled,
  title = '파일 첨부',
  className,
  children,
}: AttachButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanSource, setScanSource] = useState<File | null>(null)

  function isMobile(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  }

  function handleFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    const mobile = isMobile()
    let imageRouted = false
    for (const f of files) {
      // 모바일 + 이미지 + 첫 이미지 → ScanFlow. 이후 파일은 직통.
      if (!imageRouted && mobile && f.type.startsWith('image/')) {
        setScanSource(f)
        imageRouted = true
      } else {
        onFile(f)
      }
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
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
          'shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40',
          className,
        )}
      >
        {children ?? <Paperclip size={16} />}
      </button>
      {scanSource && (
        <Suspense fallback={null}>
          <ScanFlow
            source={scanSource}
            onClose={() => setScanSource(null)}
            onConfirm={(file) => {
              onFile(file)
              setScanSource(null)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
