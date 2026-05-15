import type { Metadata, Viewport } from 'next'
import { Inter, Inter_Tight, Manrope, Source_Serif_4, JetBrains_Mono, Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ConfirmProvider } from '@petmove/ui'
import { ServiceWorkerRegister } from '@/components/sw-register'

// next/font — 동일 오리진에서 폰트 서빙, Turbopack/CSS @import 이슈 우회.
// CSS 변수로 노출해서 tailwind fontFamily 가 참조.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
})
// flat 스킨 전용 — Linear/Notion 톤. Inter Tight 보다 넓은 여백, 차분한 인상.
// italic 미로드 — flat 은 italic 안 씀 (CSS 로 .italic strip), 30~40KB 절약.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-flat',
  display: 'swap',
})
// hygge 스킨 전용 — soft geometric. italic 없음 (CSS 로 .italic strip).
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-neu',
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
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
})
// 한글 글리프 — latin 폰트 뒤 fallback 으로 사용. Pretendard 와 비슷한 현대 톤.
const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-kr',
  display: 'swap',
})
const notoSerifKr = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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

// hydration 전에 동기 실행 — localStorage 읽어 data-skin/.dark 미리 박아 FOUC 방지.
// ThemeProvider 의 useEffect 가 같은 값을 다시 쓰지만 깜빡임 없음. VALID_SKINS 와
// FORCE_DEFAULT_PATHS 는 theme-provider.tsx 와 동기화 유지.
const SKIN_BOOT_SCRIPT = `(function(){try{
var p=location.pathname;
var force=p.indexOf('/apply')===0||p.indexOf('/share')===0;
var h=document.documentElement;
var m=localStorage.getItem('theme');
var theme=force?'system':(m==='dark'||m==='light'?m:'system');
h.setAttribute('data-theme',theme);
var dark=!force&&(m==='dark'||((!m||m==='system')&&matchMedia('(prefers-color-scheme: dark)').matches));
if(dark)h.classList.add('dark');
var s=force?null:localStorage.getItem('skin');
var V=['glassmorphism','sakura','baby-blue','scandi-minimal','art-deco','flat','hygge'];
if(s&&V.indexOf(s)>=0)h.setAttribute('data-skin',s);
}catch(e){}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${interTight.variable} ${inter.variable} ${manrope.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${notoSansKr.variable} ${notoSerifKr.variable}`}>
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
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2-subset/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOT_SCRIPT }} />
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
