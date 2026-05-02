import type { Metadata, Viewport } from 'next'
import { Inter_Tight, Source_Serif_4, JetBrains_Mono, Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ServiceWorkerRegister } from '@/components/sw-register'

// next/font — 동일 오리진에서 폰트 서빙, Turbopack/CSS @import 이슈 우회.
// CSS 변수로 노출해서 tailwind fontFamily 가 참조.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})
// 한글 글리프 — latin 폰트 뒤 fallback 으로 사용. Pretendard 와 비슷한 현대 톤.
const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans-kr',
  display: 'swap',
})
const notoSerifKr = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-serif-kr',
  display: 'swap',
})

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
    <html lang="ko" suppressHydrationWarning className={`${interTight.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${notoSansKr.variable} ${notoSerifKr.variable}`}>
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
