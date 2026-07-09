'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Smartphone, X } from 'lucide-react'
import { createPortalPreviewUrl } from '@/lib/actions/portal-preview'

interface Props {
  caseId: string
  caseLabel: string
  onClose: () => void
}

/**
 * 펫무브(portal) 고객앱 미리보기 — 케이스 상세에서 띄우는 폰 프레임 모달.
 *
 * 열릴 때 admin 서버액션으로 단기 서명 토큰 URL 을 받아 iframe 으로 portal 의
 * /preview/[token] 을 로드한다. 보호자가 보는 여정 화면을 그대로 보여준다.
 */
export function PortalPreviewDialog({ caseId, caseLabel, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // ESC 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 마운트 시 미리보기 URL 발급.
  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(null)
    createPortalPreviewUrl(caseId).then((r) => {
      if (cancelled) return
      if (r.ok) setUrl(r.url)
      else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [caseId])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-md"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex w-full items-center justify-between gap-md">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-serif text-[16px] font-medium leading-tight text-white">
              <Smartphone className="h-4 w-4 shrink-0" />
              고객앱 미리보기
            </h2>
            <p className="mt-0.5 truncate font-serif text-[12px] text-white/55">
              {caseLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="새 창에서 열기"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              aria-label="닫기"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Phone frame — 아이폰 15/16 논리 해상도 393×852(≈19.5:9)를 기준으로 aspect-ratio 를
            고정해 실기기 비율 그대로 보이게. 높이는 뷰포트에 맞춰 축소하되 비율은 유지.
            베젤은 얇게(6px) + 미세 림 하이라이트로 세련되게. iframe 은 데스크톱 클래식 스크롤바
            폭(~17px)만큼 넓혀 overflow-hidden 으로 가린다 → 콘텐츠 폭이 실폰과 동일. */}
        <div className="rounded-[46px] bg-neutral-950 p-[6px] shadow-[0_25px_70px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
          <div
            className="overflow-hidden rounded-[40px] bg-[#F5EFE8]"
            style={{ height: 'min(852px, 80vh)', aspectRatio: '393 / 852' }}
          >
            {error ? (
              <div className="flex h-full items-center justify-center px-8 text-center">
                <p className="font-serif text-[13px] leading-relaxed text-neutral-500">
                  {error}
                </p>
              </div>
            ) : url ? (
              <iframe
                src={url}
                title="펫무브 고객앱 미리보기"
                className="h-full border-0"
                style={{ width: 'calc(100% + 17px)' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="font-mono text-[11px] uppercase tracking-[1.5px] text-neutral-400">
                  불러오는 중…
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/40">
          펫무브 · 보호자가 보는 화면
        </p>
      </div>
    </div>,
    document.body,
  )
}
