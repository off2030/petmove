import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'

// Font tokens are declared in globals.css and use self-hosted assets/system fallbacks.
// Keeping fonts out of next/font/google makes release builds independent of Google Fonts fetches.

export const metadata: Metadata = {
  title: '펫무브워크',
  description: '반려동물 해외 이동 검역 관리',
  // iOS Safari "홈 화면에 추가" 시 standalone 진입 + 상태바/타이틀
  appleWebApp: {
    capable: true,
    title: '펫무브워크',
    statusBarStyle: 'default',
  },
  // Next 16 은 deprecated 처리해서 mobile-web-app-capable 만 출력하지만,
  // iOS < 16.4 에서 standalone 진입하려면 legacy apple- 접두 버전이 필요.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
}

// 모바일 대응 — width=device-width + viewport-fit=cover (iOS safe-area 진입조건)
// interactive-widget=resizes-content — Android 키보드 올라올 때 viewport resize 대신 콘텐츠만
// themeColor — Android Chrome 주소창/상태바 색. manifest 에도 있지만 head 직접 표기가 더 빠름.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#F5F4ED',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 웹폰트 preload — Alonzo(좌측 워드마크), Pretendard(한글 글리프).
            font-display: swap 라 로딩 늦으면 fallback → 실폰트 스왑 시 폭 변경 →
            상단바 레이아웃 튐. preload 로 HTML 파싱과 동시에 fetch 시작. */}
        <link
          rel="preload"
          href="/fonts/Alonzo-ExtraLight.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* FOUC 방지 부트 스크립트 — head 에서 블로킹 로드돼 hydration 전 동기 실행.
            외부 파일(public/skin-boot.js) src 참조라 React 19/Next 16 의 인라인
            "script tag while rendering" 경고가 뜨지 않음.

            no-sync-scripts 를 끄는 이유: 이 규칙은 '블로킹 스크립트가 페이지를 느리게 한다'는
            일반론인데, 여기서는 **블로킹이 목적**이다. 첫 페인트 전에 스킨을 확정하지 못하면
            화면이 번쩍인다(FOUC). next/script 의 beforeInteractive 로 바꾸면 실행 시점이
            달라져 FOUC 가 되살아날 수 있어 채택하지 않았다. (2026-07-20 — 이 error 하나 때문에
            CI 가 하루 넘게 빨간불이었고, 그 탓에 새 실패와 기존 실패를 구분할 수 없었다.) */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/skin-boot.js" />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased font-sans">
        <ThemeProvider />
        <ServiceWorkerRegister />
        <ConfirmProvider>
          <div className="flex flex-col h-dvh">
            {children}
          </div>
        </ConfirmProvider>
      </body>
    </html>
  )
}
