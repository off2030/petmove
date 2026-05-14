import type { Metadata, Viewport } from 'next'
import { Inter_Tight } from 'next/font/google'
import './globals.css'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'

// Portal MVP 폰트 스택 — Inter_Tight (body sans, next/font self-host) + Fraunces
// (display serif, globals.css 의 @import 로 Google Fonts CDN 로드).
// Fraunces 를 next/font 가 아닌 CSS @import 로 가져오는 이유: portal-preview JSX
// 와 동일한 inline fontFamily ("'Fraunces', 'Pretendard Variable', serif") 를 그대로
// 매칭시키려면 family 이름이 해시되지 않은 리터럴 'Fraunces' 여야 한다. next/font
// 는 family 명을 __Fraunces_xxxx 식으로 해시하므로 리터럴 미스매치 → 시스템 serif
// 폴백 문제가 있었음.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '펫무브',
  description: '반려동물 해외 출국 — 보호자 셀프서비스',
  appleWebApp: {
    capable: true,
    title: '펫무브',
    statusBarStyle: 'default',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
}

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
    <html
      lang="ko"
      suppressHydrationWarning
      className={interTight.variable}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased font-sans">
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
