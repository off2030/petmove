import type { Metadata } from 'next'
import { CopyAttribution } from '@/components/copy-attribution'
import { TransportLinkTracker } from '@/components/transport-link-tracker'
import { SiteJsonLd } from '@/components/structured-data'
import '@/styles/pretendard.css'
import '@/styles/icons.css'
import '@/styles/site.css'
import '@/styles/landing.css'
import '@/styles/hub.css'
import '@/styles/article.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.petmove.co.kr'),
  // 하위 페이지는 각자 alternates.canonical 로 덮어쓴다(랜딩만 이 값을 그대로 쓴다).
  alternates: { canonical: '/' },
  title: '펫무브 · 반려동물 해외 이동',
  description: '우리 아이 해외여행, 펫무브가 챙겨줘요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.',
  openGraph: {
    type: 'website',
    siteName: '펫무브',
    title: '펫무브 · 반려동물 해외 이동',
    description: '우리 아이 해외여행, 펫무브가 챙겨줘요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.',
    locale: 'ko_KR',
    images: [{ url: '/img/og.png', width: 1200, height: 630, alt: '펫무브 - 반려동물과 함께하는 해외여행' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SiteJsonLd />
        {children}
        <CopyAttribution />
        <TransportLinkTracker />
      </body>
    </html>
  )
}
