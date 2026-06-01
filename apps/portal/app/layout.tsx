import type { Metadata, Viewport } from 'next'
import { Inter_Tight } from 'next/font/google'
import './globals.css'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'
import { ThemeProvider } from '@/components/portal-shell/theme-provider'

// 최초 paint 전(하이드레이션 전) <html data-theme> + theme-color 를 동기 설정해 다크모드 FOUC 방지.
// 저장된 pm-theme(없으면 system) → OS 설정으로 라이트/다크 결정. ThemeProvider 가 이후 상태를 이어받음.
const themeNoFlash = `(function(){try{var m=localStorage.getItem('pm-theme')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var c=d?'#1C1916':'#F5EFE8';var e=document.querySelector('meta[name="theme-color"]');if(!e){e=document.createElement('meta');e.setAttribute('name','theme-color');document.head.appendChild(e);}e.setAttribute('content',c);}catch(_){}})();`

// Portal 폰트 스택 — next/font self-host Inter Tight + globals.css @font-face 의 Pretendard/Alonzo.
// CSS 변수 --font-sans 로 노출하고, globals.css 가 semantic 토큰
// (--pm-font-display, --pm-font-body, --pm-font-mark) 으로 한 번 더 추상화. UI 코드는
// semantic 토큰만 참조 → 폰트 출처를 바꿔도 컴포넌트 손 안 댐.
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
        <script dangerouslySetInnerHTML={{ __html: themeNoFlash }} />
        <ServiceWorkerRegister />
        <ThemeProvider>
          <ConfirmProvider>
            <div className="flex flex-col h-dvh">
              {children}
            </div>
          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
