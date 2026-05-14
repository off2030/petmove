import type { Metadata, Viewport } from 'next'
import { Inter_Tight, Fraunces } from 'next/font/google'
import './globals.css'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'

// Portal MVP 폰트 스택 — Inter_Tight (body sans) + Fraunces (display serif) 만.
// 이전엔 admin 과 동일하게 6 family (Source_Serif_4, JetBrains_Mono, Noto_Sans_KR,
// Noto_Serif_KR 포함) 였으나 ① portal 컴포넌트가 직접 참조하는 건 Fraunces/Inter 뿐
// ② Noto_*_KR 는 subsets: ['latin'] 이라 한글 글자 미포함 (사실상 무용)
// ③ 첫 로드 시 30+ 폰트 파일 다운로드가 Chrome progress bar 마지막 20-30% lag 의 원인.
// globals.css 의 var(--font-mono) / --font-serif-kr 등 미정의 변수는 CSS fallback 체인
// (Pretendard, Georgia, system) 으로 자연스럽게 처리됨.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
})
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
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
      className={`${interTight.variable} ${fraunces.variable}`}
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
