import type { Metadata, Viewport } from 'next'
// Pretendard variable dynamic subset — 유니코드 범위별 분할 woff2 (실사용 범위만 로드).
// self-hosted: Next 가 패키지의 CSS·woff2 를 해시 정적 자산으로 번들, 외부 CDN fetch 없음.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './globals.css'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'
import { AppInstallPromo } from '@/components/app-install-promo'
import { NativeSplash } from '@/components/native-splash'
import { NativeAuthListener } from '@/components/native-auth-listener'
import { NotificationTapListener } from '@/components/notification-tap-listener'
import { NativeStatusBar } from '@/components/native-statusbar'
import { ThemeProvider } from '@/components/portal-shell/theme-provider'
import { NavGuardProvider } from '@/components/portal-shell/nav-guard'
import { MediaViewerProvider } from '@/components/portal-shell/media-viewer'

// 최초 paint 전(하이드레이션 전) <html data-theme> + theme-color 를 동기 설정해 다크모드 FOUC 방지.
// 저장된 pm-theme(없으면 light) → 'system' 일 때만 OS 따라감. ThemeProvider 가 이후 상태를 이어받음.
const themeNoFlash = `(function(){try{var m=localStorage.getItem('pm-theme')||'light';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.classList.toggle('dark',d);var c=d?'#17171A':'#FFFFFF';var e=document.querySelector('meta[name="theme-color"]');if(!e){e=document.createElement('meta');e.setAttribute('name','theme-color');document.head.appendChild(e);}e.setAttribute('content',c);}catch(_){}})();`

// Portal 폰트: Pretendard = 위 npm 패키지 dynamic subset, Alonzo = globals.css self-hosted @font-face.
// next/font/google 은 빌드 때 Google Fonts 네트워크 fetch 가 필요해 재현 가능한 출시 빌드를 막는다.

// PWA(홈 화면 추가) 비활성 — 네이티브 앱으로만 설치 유도(manifest.ts 와 한 쌍).
// apple-mobile-web-app-capable 을 켜지 않으면 iOS 에서 홈 화면에 추가해도 standalone PWA 가
// 아니라 Safari 로 열린다(= 앱처럼 설치되지 않음). Capacitor 네이티브 WKWebView 는 이 태그를
// 참조하지 않으므로(상태바는 StatusBar 플러그인이 제어) 네이티브 앱엔 영향 없음.
export const metadata: Metadata = {
  title: '펫무브',
  description: '반려동물 해외 출국 — 보호자 셀프서비스',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#FFFFFF',
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
    >
      <body className="min-h-dvh bg-background text-foreground antialiased font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeNoFlash }} />
        {/* Supabase 사전 연결 — 첫 client 호출(realtime·auth·storage)의 DNS+TLS 왕복 절약.
            React 19 가 <head> 로 호이스팅. CORS fetch 재사용을 위해 crossOrigin 명시. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        )}
        <ServiceWorkerRegister />
        <AppInstallPromo />
        <NativeSplash />
        <NativeAuthListener />
        <NotificationTapListener />
        <NativeStatusBar />
        <ThemeProvider>
          <ConfirmProvider>
            <NavGuardProvider>
              <MediaViewerProvider>
                <div className="flex flex-col h-dvh">
                  {children}
                </div>
              </MediaViewerProvider>
            </NavGuardProvider>
          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
