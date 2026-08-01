import type { Metadata } from 'next'
import { CopyAttribution } from '@/components/copy-attribution'
import '@/styles/site.css'
import '@/styles/landing.css'
import '@/styles/hub.css'
import '@/styles/article.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.petmove.co.kr'),
  title: '펫무브 · 반려동물 해외 이동',
  description: '우리 아이 해외여행, 펫무브가 챙겨줘요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.',
  openGraph: {
    type: 'website',
    siteName: '펫무브',
    title: '펫무브 · 반려동물 해외 이동',
    description: '우리 아이 해외여행, 펫무브가 챙겨줘요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.',
    locale: 'ko_KR',
    images: [{ url: '/img/og.png', width: 1200, height: 630, alt: '펫무브 — 반려동물과 함께하는 해외여행' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard·Tabler 아이콘 — 프로토타입과 동일한 CDN. next/font/local 전환은 후속 과제. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {children}
        <CopyAttribution />
      </body>
    </html>
  )
}
