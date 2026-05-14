import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter_Tight } from 'next/font/google'
import './globals.css'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'

// Portal 폰트 스택 — next/font self-host 두 family + globals.css @font-face 의 Pretendard/Alonzo.
// CSS 변수 --font-sans / --font-fraunces 로 노출하고, globals.css 가 semantic 토큰
// (--pm-font-display, --pm-font-body, --pm-font-mark) 으로 한 번 더 추상화. UI 코드는
// semantic 토큰만 참조 → 폰트 출처를 바꿔도 컴포넌트 손 안 댐.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
})
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-fraunces',
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
