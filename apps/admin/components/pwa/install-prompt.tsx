'use client'

import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'

// PWA "홈 화면에 추가" 안내 — 모바일 한정, 인앱 브라우저 제외, 1회 닫음 영속.
// iOS Safari: beforeinstallprompt 미지원 → 수동 안내 텍스트.
// Android Chrome: beforeinstallprompt 캐치 → 설치 버튼.
const DISMISS_KEY = 'petmove:pwa:install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Mode = 'ios' | 'android'

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 표시하지 않을 조건
    if (localStorage.getItem(DISMISS_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as { standalone?: boolean }).standalone) return
    if (!window.matchMedia('(max-width: 767px)').matches) return

    const ua = navigator.userAgent
    // 인앱 브라우저(카톡/Insta/Facebook/Naver) — PWA 설치 자체 불가
    if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER/i.test(ua)) return

    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isAndroid = /Android/.test(ua)

    if (isIOS) {
      // iOS Safari 만 표준 PWA. CriOS/FxiOS 도 WebKit 이지만 안내 UX 다름 → Safari 만.
      const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
      if (!isSafari) return
      // 첫 진입 즉시 X — 페이지 익숙해진 뒤 (1.5s 후) 노출
      const timer = setTimeout(() => setMode('ios'), 1500)
      return () => clearTimeout(timer)
    }

    if (isAndroid) {
      const handler = (e: Event) => {
        e.preventDefault()
        setBipEvent(e as BeforeInstallPromptEvent)
        setMode('android')
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setMode(null)
  }

  const install = async () => {
    if (!bipEvent) return
    try {
      await bipEvent.prompt()
      await bipEvent.userChoice
    } catch {
      // 사용자 취소 또는 브라우저 거절 — 무시
    }
    dismiss()
  }

  if (!mode) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-foreground/15 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="px-md py-sm flex items-start gap-sm">
        <div className="shrink-0 mt-0.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#A56D54]">
            <span className="font-serif text-[18px] font-medium text-[#F5F4ED]">P</span>
          </span>
        </div>

        <div className="flex-1 min-w-0 font-serif">
          <div className="text-[14px] text-foreground/90 font-medium">홈 화면에 추가</div>
          {mode === 'ios' ? (
            <div className="text-[12px] text-foreground/60 leading-snug">
              하단 <Share size={11} className="inline -mt-0.5" /> 공유 → &lsquo;홈 화면에 추가&rsquo;
            </div>
          ) : (
            <div className="text-[12px] text-foreground/60 leading-snug">
              앱처럼 빠르게 진입할 수 있어요
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {mode === 'android' && (
            <button
              type="button"
              onClick={install}
              className="rounded-full bg-foreground text-background font-serif text-[12px] h-7 px-3 hover:bg-foreground/90"
            >
              설치
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1.5 text-foreground/50 hover:text-foreground hover:bg-muted/40"
            aria-label="다시 보지 않기"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
