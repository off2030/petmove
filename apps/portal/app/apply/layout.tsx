import type { Metadata } from 'next'

// 고객에게 보내는 공개 신청서 — 카톡/iMessage 링크 미리보기와 브라우저 탭이
// 루트 layout 의 "펫무브워크"(직원용 admin 앱 이름) 를 상속받지 않도록
// 고객 친화적인 "펫무브" 브랜드로 override.
export const metadata: Metadata = {
  title: '펫무브 등록 신청서',
  description: '반려동물 해외 이동 등록 신청서',
  openGraph: {
    title: '펫무브 등록 신청서',
    description: '반려동물 해외 이동 등록 신청서',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '펫무브 등록 신청서',
    description: '반려동물 해외 이동 등록 신청서',
  },
}

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
